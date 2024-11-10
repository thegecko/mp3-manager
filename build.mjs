import fs from 'fs'
import * as esbuild from 'esbuild'

/** @typedef {import('esbuild').BuildOptions} BuildOptions **/

const WATCH = process.argv[2] === 'watch';

const createHtml = (path) => {
    const output = fs.readFileSync(path, 'utf8');
    const html = fs.readFileSync('src/template.html', 'utf8');
    const result = html.replace('{{script}}', output);
    fs.writeFileSync(path, result);
    console.log(`wrote ${path}`);
};

/** @type BuildOptions */
const common = {
    sourcemap: WATCH,
    minify: !WATCH,
    bundle: true,
    plugins: [{
        name: 'template-html',
        setup(build) {
            build.onEnd(results => {
                if (results.errors.length === 0) {
                    createHtml(build.initialOptions.outfile);
                }
            })
        }
    }]
};

/** @type BuildOptions[] */
const configs = [
    {
        ...common,
        entryPoints: [
            'src/index.tsx'
        ],
        platform: 'browser',
        format: 'esm',
        outfile: 'dist/index.html'
    }
];

for (const config of configs) {
    if (WATCH) {
        const ctx = await esbuild.context(config);
        await ctx.watch();
    } else {
        await esbuild.build(config);
    }
}

if (WATCH) {
    console.log('watching...');
}
