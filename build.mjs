import { build } from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

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
    target:      'node20',
    format:      'cjs',
    outfile,
    sourcemap:   false,
    minify:      false,
    logLevel:    'info',
    plugins: [{
        name: 'external-node-modules',
        setup(build) {
            // Marca como external todo specifier que não começa com '.' ou '/'
            // Cobre pacotes npm, escopos (@org/pkg), módulos node: e qualquer
            // dependência não listada explicitamente no package.json
            build.onResolve({ filter: /^[^./]/ }, args => ({
                path:     args.path,
                external: true,
            }));
        },
    }],
});

const shouldObfuscate = process.env.CI === 'true' || process.argv.includes('--obfuscate');
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
