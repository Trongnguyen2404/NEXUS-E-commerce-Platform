const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const srcDir = path.join(rootDir, 'src');

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        const dirPath = path.join(dir, f);
        if (fs.statSync(dirPath).isDirectory()) {
            walkDir(dirPath, callback);
        } else {
            callback(dirPath);
        }
    });
}

walkDir(srcDir, (filePath) => {
    if (!filePath.endsWith('.ts')) return;

    let content = fs.readFileSync(filePath, 'utf8');
    let originalContent = content;

    const regex = /(from\s+['"])([^'"]+)(['"])/g;

    content = content.replace(regex, (match, prefix, importPath, suffix) => {

        // ❌ bỏ qua thư viện ngoài
        if (!importPath.startsWith('.') && !importPath.startsWith('src')) {
            return match;
        }

        let newPath = importPath;

        // 👉 nếu là relative → convert
        if (importPath.startsWith('.')) {
            const absolutePath = path.resolve(path.dirname(filePath), importPath);
            newPath = path.relative(srcDir, absolutePath).replace(/\\/g, '/');
        }

        // 👉 nếu là src/... → bỏ src
        if (newPath.startsWith('src/')) {
            newPath = newPath.replace(/^src\//, '');
        }

        // 👉 bỏ .ts
        newPath = newPath.replace(/\.ts$/, '');

        // 👉 xử lý index
        if (newPath.endsWith('/index')) {
            newPath = newPath.replace('/index', '');
        }

        return `${prefix}@/${newPath}${suffix}`;
    });

    if (content !== originalContent) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`✅ ${path.relative(rootDir, filePath)}`);
    }
});

console.log('🎉 DONE: Convert ALL import → @/');