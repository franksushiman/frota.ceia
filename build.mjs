import { build } from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const _dirname = dirname(__filename);
const outfile = join(_dirname, 'dist', 'server.cjs');

if (!existsSync(join(_dirname, 'dist'))) {
    mkdirSync(join(_dirname, 'dist'), { recursive: true });
}

console.log('🔨 Compilando servidor CEIA...');

await build({
    entryPoints: [join(_dirname, 'index.ts')],
    bundle:      true,
    platform:    'node',
    target:      'node18',
    format:      'cjs',
    outfile,
    // sqlite3  — binário nativo (.node), não pode ser embutido.
    // telegraf — usa AbortSignal internamente; quando bundled o instanceof
    //            falha por realm-mismatch. É CJS puro, então fica externo.
    // Todos os outros pacotes (incluindo baileys ESM-only) são embutidos
    // inline aqui em tempo de build, eliminando a dependência da versão
    // do Node instalada no sistema do lojista.
    external:    ['sqlite3', 'telegraf'],
    // Polyfill para Node v18: globalThis.crypto não é exposto globalmente
    // por padrão antes do Node v19. Esta linha garante compatibilidade.
    banner:      { js: `if (!globalThis.crypto) { try { const { webcrypto } = require('node:crypto'); globalThis.crypto = webcrypto; } catch(_) {} }` },
    sourcemap:   false,
    minify:      false,
    logLevel:    'info',
});

// Copia o frontend estático para dist/ — o server.ts o serve de __dirname/index.html
copyFileSync(join(_dirname, 'index.html'), join(_dirname, 'dist', 'index.html'));
console.log('📄 index.html copiado para dist/');

const shouldObfuscate = process.argv.includes('--obfuscate');
if (shouldObfuscate) {
    console.log('🔒 Ofuscando código...');
    const { default: JavaScriptObfuscator } = await import('javascript-obfuscator');
    const code = readFileSync(outfile, 'utf8');
    const result = JavaScriptObfuscator.obfuscate(code, {
        compact:                         true,
        controlFlowFlattening:           true,
        controlFlowFlatteningThreshold:  0.75,
        numbersToExpressions:            true,
        simplify:                        true,
        stringArrayShuffle:              true,
        splitStrings:                    true,
        stringArrayThreshold:            0.75,
        reservedNames:                   ['^require$', '^__dirname$', '^__filename$', '^process$', '^Buffer$'],
    });
    writeFileSync(outfile, result.getObfuscatedCode());
    console.log('✅ Compilação concluída e ofuscada →', outfile);
} else {
    console.log('✅ Compilação concluída (sem ofuscação — modo dev) →', outfile);
}
