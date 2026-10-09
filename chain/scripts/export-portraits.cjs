const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const source = path.resolve(__dirname, '../../src/game/content/trainers');
const target = path.resolve(__dirname, '../../public/nft/trainers');
fs.mkdirSync(target, { recursive: true });
const manifest = fs.readdirSync(source, { withFileTypes: true }).filter(item => item.isDirectory()).map(item => {
    const meta = JSON.parse(fs.readFileSync(path.join(source, item.name, 'trainer.json'), 'utf8'));
    const extension = fs.existsSync(path.join(source, item.name, 'face.png')) ? 'png' : 'svg';
    const portrait = fs.readFileSync(path.join(source, item.name, `face.${extension}`));
    const file = `${item.name}.${extension}`;
    fs.writeFileSync(path.join(target, file), portrait);
    return { opponentId: meta.order - 1, trainer: item.name, image: file, sha256: createHash('sha256').update(portrait).digest('hex') };
}).sort((a, b) => a.opponentId - b.opponentId);
fs.writeFileSync(path.join(target, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Exported ${manifest.length} original trainer portraits to public/nft/trainers/`);
