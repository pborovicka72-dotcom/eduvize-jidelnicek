"""Conservative course extraction from public canteen prose; never invent missing courses."""
import re

_CODES = r'[0-9]{1,2}[a-d]?(?:\s*[,;]\s*[0-9]{1,2}[a-d]?)*'
MARKER = re.compile(r'\bA\s*:\s*(?P<inline>'+_CODES+r')?|(?:_?\{)?\s*[\[(]\s*(?:A\s*:\s*)?(?P<bracket>'+_CODES+r')\s*[\])]\s*\}?', re.I)
UNCLOSED = re.compile(r'\s*[\[(]\s*(?P<codes>'+_CODES+r')\s*$', re.I)
LUNCH = re.compile(r'^Oběd\s*([0-9]+|[A-Z]{2,4})?$', re.I)
SOUP = re.compile(r'\b(?:polévka|polévky|pol\.|vývar|krém|bramboračka|kulajda)\b|^pol\.', re.I)
SOUP_START = re.compile(r'^(?:květáková|kapustová|písmenková|gulášová|vločková|čočková|hrachová|zelná|špenátová|rajská)\b', re.I)
# These continue a soup ingredient list, rather than start a new course.
CONTINUATION = re.compile(r'^(?:a\s|s\s|se\s|houbami\b|mrkví\b|koprem\b|smetanou\b|zeleninou\b|nudlemi\b|masem\b)', re.I)
SUPPLEMENT = re.compile(r'^(?:ovoce\b|banán\b|jablk\w*\b|hrušk\w*\b|pomeranč\w*\b|kompot\b|(?:jablečný|ovocný)\s+kompot\b|nápoj\b|voda\b|čaj\b|mléko\b|(?:acidofilní|ochucené)\s+mléko\b|džus\b|šťáva\b|salát\b|(?:zeleninový|mrkvový|rajčatový|okurkový|zelný|listový|ledový|ovocný)\s+salát\b|červená\s+řepa\b|červ\.\s*řepa\b|dezert\b|jogurt\b)', re.I)


def codes(text):
    found=[]
    for match in MARKER.finditer(text):
        found.extend(re.findall(r'[0-9]{1,2}[a-d]?',match.group('inline') or match.group('bracket') or '',re.I))
    end=UNCLOSED.search(text)
    if end:found.extend(re.findall(r'[0-9]{1,2}[a-d]?',end['codes'],re.I))
    return ', '.join(dict.fromkeys(found))


def clean(text):
    text=UNCLOSED.sub('',MARKER.sub('',text))
    return ' '.join(text.split()).strip(' ,;')


def top_level_parts(text):
    """Commas inside ingredient parentheses belong to that dish."""
    parts=[];start=0;depth=0
    for i,char in enumerate(text):
        if char in '([{':depth+=1
        elif char in ')]}':depth=max(0,depth-1)
        elif char in ',;' and not depth:
            if text[start:i].strip():parts.append(text[start:i].strip())
            start=i+1
    if text[start:].strip():parts.append(text[start:].strip())
    return parts


def looks_like_soup(text):
    first=clean(text).split(',',1)[0]
    return bool(SOUP.search(first) or (SOUP_START.search(first) and not re.search(r'\b(?:kaše|salát|pomazánka)\b',first,re.I)))


def split_soup(raw):
    if not looks_like_soup(raw):return '',raw,False
    # Per-course allergens are an especially useful boundary in 0463's unpunctuated menu.
    for match in MARKER.finditer(raw):
        before=raw[:match.end()];after=raw[match.end():].lstrip(' ,;–—-')
        prefix=top_level_parts(clean(before))
        # A marker after soup AND the main dish describes the whole menu, not just soup.
        if len(prefix)>1 and any(not CONTINUATION.match(part) for part in prefix[1:]):break
        if clean(before) and clean(after):return before,after,True
    # 0022 separates soup and main course with a spaced dash.
    dash=re.search(r'\s+[–—-]\s+',raw)
    if dash:return raw[:dash.start()],raw[dash.end():],False
    parts=top_level_parts(raw)
    if len(parts)>1:
        boundary=1
        while boundary<len(parts) and CONTINUATION.match(clean(parts[boundary])):boundary+=1
        if boundary<len(parts):return ', '.join(parts[:boundary]),', '.join(parts[boundary:]),False
    return '',raw,False


def structure_meal(group, raw):
    """Keep the source record and add Strava-compatible named course groups."""
    meal={'name':clean(raw),'group':group,'allergens':codes(raw)}
    lunch=LUNCH.fullmatch(group)
    if not lunch or not meal['name'] or meal['name']=='.':return meal
    variant=lunch.group(1) or ''
    soup,main,explicit=split_soup(raw)
    parts=top_level_parts(clean(main));supplements=[]
    # A salad can itself be the main course. Only confidently recognized trailing extras move.
    while len(parts)>1 and SUPPLEMENT.match(parts[-1]):supplements.insert(0,parts.pop())
    main_name=', '.join(parts)
    rest_codes=codes(main) if explicit else meal['allergens']
    scope=('section' if supplements else 'course') if explicit else 'menu'
    components=[]
    def add(name,kind,allergens,allergen_scope):
        if name:components.append({'name':name,'group':kind,'allergens':allergens,'allergenScope':allergen_scope,'variant':variant,'sourceGroup':group})
    add(clean(soup),'Polévka',codes(soup) if explicit else meal['allergens'],'course' if explicit else 'menu')
    add(main_name,group,rest_codes,scope)
    for name in supplements:add(name,'Doplněk',rest_codes,scope)
    if soup or supplements:
        meal['sourceText']=raw
        meal['components']=components
    return meal
