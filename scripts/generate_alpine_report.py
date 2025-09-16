#!/usr/bin/env python3
"""Generate a JSON report mapping templates -> x-data component -> template-used properties -> component-provided keys
Writes output to outputs/alpine_report.json
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEMPLATES_DIR = ROOT / 'app' / 'frontend' / 'templates'
COMPONENTS_DIR = ROOT / 'app' / 'frontend' / 'static' / 'js' / 'components'
ALPINE_CONFIG = ROOT / 'app' / 'frontend' / 'static' / 'js' / 'alpine-config.js'
OUTPUT = ROOT / 'outputs' / 'alpine_report.json'
TEMPLATE_COMPONENTS_DIR = TEMPLATES_DIR / 'components'

# Helpers
id_pattern = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")

# Find all template files
template_files = list(TEMPLATES_DIR.rglob('*.html'))

# Patterns to extract x-data and template expressions
xdata_re = re.compile(r'x-data\s*=\s*["\']([A-Za-z0-9_]+)\s*\(')
expr_attrs = [r'x-model(?:\.number)?\s*=\s*"([^"]+)"', r"x-text\s*=\s*\"([^\"]+)\"",
              r"x-show\s*=\s*\"([^\"]+)\"", r":class\s*=\s*\"([^\"]+)\"",
              r":value\s*=\s*\"([^\"]+)\"", r"x-for\s*=\s*\"([^\"]+)\"",
              r"x-init\s*=\s*\"([^\"]+)\"", r"x-bind:[^=]+\s*=\s*\"([^\"]+)\""]
expr_re = re.compile('|'.join(expr_attrs))

def flatten_obj_keys(obj, prefix=''):
    """Yield flattened dotted keys from nested obj where leaves are True or dicts."""
    keys = []
    for k, v in obj.items():
        dotted = f"{prefix}{k}" if prefix == '' else f"{prefix}.{k}"
        keys.append(dotted)
        if isinstance(v, dict):
            keys.extend(flatten_obj_keys(v, dotted))
    return keys


# Collect template usages
report = {}
for tf in template_files:
    text = tf.read_text(encoding='utf8')
    matches = xdata_re.findall(text)
    if not matches:
        continue
    # collect expressions; capture dotted identifiers like `exportConfig.loras` or `params.prompt`
    props = set()
    # match dotted identifiers with word boundaries to avoid partial matches
    dotted_ident_re = re.compile(r"(?<![A-Za-z0-9_])([a-z_][a-z0-9_]*(?:\.[a-z0-9_]+)*)(?![A-Za-z0-9_])")
    for m in expr_re.finditer(text):
        expr = next(g for g in m.groups() if g)
        # find all dotted identifier tokens
        for dm in dotted_ident_re.finditer(expr):
            token = dm.group(1)
            # skip single-letter tokens or tokens that look like CSS classes (heuristic)
            if not token: continue
            # keep tokens starting with lowercase
            if token[0].islower():
                props.add(token)
    for comp in matches:
        report.setdefault(str(tf.relative_to(ROOT)), {})[comp] = {
            'template_properties': sorted(list(props)),
        }

# Parse components to extract provided keys
# Helper to parse JS object keys inside a return { ... } or Alpine.data(..., () => ({ ... }))
key_re = re.compile(r"^[ \t]*([A-Za-z_][A-Za-z0-9_]*)\s*:\s", re.MULTILINE)

component_files = []
if COMPONENTS_DIR.exists():
    component_files += list(COMPONENTS_DIR.rglob('*.js'))
if ALPINE_CONFIG.exists():
    component_files.append(ALPINE_CONFIG)
# Also include <script> blocks inside template component HTML files (e.g., lora-card.html)
if TEMPLATE_COMPONENTS_DIR.exists():
    for h in TEMPLATE_COMPONENTS_DIR.rglob('*.html'):
        # extract script blocks into a temp-like representation
        text = h.read_text(encoding='utf8')
        scripts = re.findall(r'<script>([\s\S]*?)</script>', text, flags=re.IGNORECASE)
        if scripts:
            # write a synthetic JS entry with filename marker
            combined = '\n'.join(scripts)
            component_files.append((str(h), combined))

components = {}
for cf in component_files:
    if isinstance(cf, tuple):
        # (path, content)
        text = cf[1]
        cf_path = cf[0]
    else:
        text = cf.read_text(encoding='utf8')
        cf_path = str(cf)
    # Helper to parse JS object starting at a brace index and return nested dict + end index
    def parse_object(text, start):
        # text[start] should be '{'
        assert text[start] == '{'
        i = start + 1
        length = len(text)
        obj = {}
        while i < length:
            # skip whitespace and commas
            while i < length and text[i] in ' \t\r\n,':
                i += 1
            if i >= length or text[i] == '}':
                break
            m = re.match(r"([A-Za-z_][A-Za-z0-9_]*)\s*:\s*", text[i:])
            if not m:
                # skip until next comma or brace
                j = i
                while j < length and text[j] not in ',}':
                    j += 1
                i = j + 1
                continue
            key = m.group(1)
            i += m.end()
            # skip whitespace
            while i < length and text[i].isspace():
                i += 1
            if i < length and text[i] == '{':
                child, new_i = parse_object(text, i)
                obj[key] = child
                i = new_i
                continue
            # handle array values - skip until matching ]
            if i < length and text[i] == '[':
                depth = 1
                j = i + 1
                while j < length and depth > 0:
                    if text[j] == '[': depth += 1
                    elif text[j] == ']': depth -= 1
                    j += 1
                i = j
                obj[key] = True
                continue
            # skip primitive value until comma or closing brace
            j = i
            while j < length and text[j] not in ',}':
                # skip over nested parentheses or strings crudely
                if text[j] == '{':
                    # find matching brace
                    depth = 1
                    k = j + 1
                    while k < length and depth > 0:
                        if text[k] == '{': depth += 1
                        elif text[k] == '}': depth -= 1
                        k += 1
                    j = k
                else:
                    j += 1
            i = j
            obj[key] = True
        # consume closing brace
        if i < length and text[i] == '}':
            i += 1
        return obj, i

    # Find function definitions that return an object: function name(...) { return { ... } }
    for fn_match in re.finditer(r'function\s+([A-Za-z0-9_]+)\s*\([^\)]*\)\s*\{', text):
        fname = fn_match.group(1)
        # try to find the 'return {' after this position
        start = fn_match.end()
        ret_match = re.search(r'return\s*\{', text[start:])
        if not ret_match:
            continue
        # find the block from start+ret_match.start() to matching brace
        block_start = start + ret_match.start()
        # naive brace matching
        i = block_start
        depth = 0
        end = None
        while i < len(text):
            ch = text[i]
            if ch == '{':
                depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0:
                    end = i
                    break
            i += 1
        if end:
            # parse the JS object nested structure starting at block_start
            try:
                obj, _ = parse_object(text, block_start)
                flat = flatten_obj_keys(obj)
                components[fname] = sorted(list(set(flat)))
            except Exception:
                # fallback to top-level key extraction
                block = text[block_start:end+1]
                keys = set(k for k in key_re.findall(block))
                components[fname] = sorted(list(keys))
    # Find Alpine.data registrations: Alpine.data('name', () => ({ ... }))
    for ad in re.finditer(r"Alpine\.data\(\s*['\"]([A-Za-z0-9_]+)['\"]\s*,\s*\(\)\s*=>\s*\(\{", text):
        name = ad.group(1)
        start = ad.end() - 2  # position at the opening ({
        # find matching paren/braces
        i = start
        depth = 0
        end = None
        while i < len(text):
            ch = text[i]
            if ch == '{': depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0:
                    end = i
                    break
            i += 1
        if end:
            try:
                obj, _ = parse_object(text, start)
                flat = flatten_obj_keys(obj)
                components[name] = sorted(list(set(flat)))
            except Exception:
                block = text[start:end+1]
                keys = set(k for k in key_re.findall(block))
                components[name] = sorted(list(keys))

# Add components to report and compute missing keys per template-component
for tf_path, comps in report.items():
    for comp_name, data in comps.items():
        provided = components.get(comp_name, None)
        data['component_provided_keys'] = provided if provided is not None else []
        # compute missing: any template property not present in provided keys (support dotted checks)
        missing = []
        for p in data['template_properties']:
            if provided is None:
                missing.append(p)
                continue
            # direct match
            if p in provided:
                continue
            # if property is dotted like a.b, check for a and a.b
            parts = p.split('.')
            found = False
            # check progressively deeper matches
            for depth in range(1, len(parts)+1):
                candidate = '.'.join(parts[:depth])
                if candidate in provided:
                    found = True
                    break
            if not found:
                missing.append(p)
        data['missing_keys'] = sorted(missing)

# Ensure outputs directory if writable, otherwise write to /tmp
try:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps({'generated_by':'generate_alpine_report.py','report':report,'components_index':components}, indent=2), encoding='utf8')
    print('Wrote', OUTPUT)
except PermissionError:
    tmp = Path('/tmp/alpine_report.json')
    tmp.write_text(json.dumps({'generated_by':'generate_alpine_report.py','report':report,'components_index':components}, indent=2), encoding='utf8')
    print('Wrote', tmp)

# Also produce a cleaned report that omits empty-missing entries for easier review
clean_out = Path('/tmp/alpine_report_nested.json')
clean_report = {'generated_by':'generate_alpine_report.py','report':{}}
for tf_path, comps in report.items():
    for comp_name, data in comps.items():
        # include only when there are meaningful template_properties or missing keys
        if data.get('template_properties') or data.get('missing_keys'):
            clean_report['report'].setdefault(tf_path, {})[comp_name] = {
                'template_properties': data.get('template_properties', []),
                'component_provided_keys': data.get('component_provided_keys', []),
                'missing_keys': data.get('missing_keys', []),
            }

clean_out.write_text(json.dumps(clean_report, indent=2), encoding='utf8')
print('Wrote', clean_out)

# Produce a focused report that hides expected nested/runtime misses
focused_out = Path('/tmp/alpine_report_focused.json')
runtime_prefixes = ('lora', 'result', 'stats', 'worker', 'gpu', 'backup')
# tokens to treat as UI/text noise
ui_tokens = set([
    'btn','button','primary','secondary','text','bg','blue','green','red','yellow','white',
    'sm','md','lg','border','shadow','rounded','icon','items','list','grid','show','hide',
    'in','init','length','slice','item','items','badge','status','tag','btn-sm','btn-lg',
])
focused = {'generated_by':'generate_alpine_report.py','report':{}}
for tf_path, comps in clean_report['report'].items():
    for comp_name, data in comps.items():
        # filter missing_keys to remove dotted and runtime-prefix keys
        filtered_missing = []
        for k in data.get('missing_keys', []):
            if '.' in k:
                continue
            if k.startswith(runtime_prefixes):
                continue
            if k in ui_tokens:
                continue
            # ignore very short tokens (1-2 letters) as likely noise
            if len(k) <= 2:
                continue
            filtered_missing.append(k)
        if filtered_missing:
            focused['report'].setdefault(tf_path, {})[comp_name] = {
                'missing_top_level_keys': filtered_missing,
                'component_provided_keys': data.get('component_provided_keys', []),
            }
focused_out.write_text(json.dumps(focused, indent=2), encoding='utf8')
print('Wrote', focused_out)

# Produce a very small report of likely real bugs using heuristics
real_out = Path('/tmp/alpine_report_real_bugs.json')
def is_camel_case(s):
    return any(c.isupper() for c in s)

def is_snake_case(s):
    return '_' in s

allowlist = set(['filters','selectedLoras','availableTags','bulkMode','viewMode','allSelected','totalLoras','isLoading','results','kpis','workers','logs','backupHistory','importFiles','exportConfig','selectedLora','selectedLoraId'])

real_report = {'generated_by':'generate_alpine_report.py','report':{}}
for tf_path, comps in focused['report'].items():
    for comp_name, data in comps.items():
        candidates = []
        for k in data.get('missing_top_level_keys', []):
            if k in allowlist or is_camel_case(k) or is_snake_case(k) or (k.endswith('s') and len(k) > 4):
                candidates.append(k)
        if candidates:
            real_report['report'].setdefault(tf_path, {})[comp_name] = {'likely_real_missing_keys': candidates, 'component_provided_keys': data.get('component_provided_keys', [])}

real_out.write_text(json.dumps(real_report, indent=2), encoding='utf8')
print('Wrote', real_out)
