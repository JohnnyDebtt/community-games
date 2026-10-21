// Stamps the stylesheet with a hash of what is in it, in the three places that must agree:
// style.css (--build), src/build.js (BUILD) and index.html (style.css?v=). Run it before
// publishing whenever style.css has changed: node tools/stamp.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const at = (p) => fileURLToPath(new URL('../' + p, import.meta.url));
const edit = (p, re, to) => {
  const s = readFileSync(at(p), 'utf8');
  if (!re.test(s)) throw new Error(`${p}: no stamp to replace`);
  writeFileSync(at(p), s.replace(re, to));
};

const BUILD_LINE = /--build: "[0-9a-f]*";/;
const css = readFileSync(at('style.css'), 'utf8').replace(BUILD_LINE, '');
const build = createHash('sha256').update(css).digest('hex').slice(0, 8);

edit('style.css', BUILD_LINE, `--build: "${build}";`);
edit('src/build.js', /BUILD = '[0-9a-f]*'/, `BUILD = '${build}'`);
edit('index.html', /style\.css(\?v=[0-9a-f]*)?"/, `style.css?v=${build}"`);
console.log(`stamped ${build}`);
