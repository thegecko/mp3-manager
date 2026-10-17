import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { viteSingleFile } from "vite-plugin-singlefile"

// https://vite.dev/config/
export default defineConfig({
    build: {
        minify: 'terser',
        terserOptions: {
            compress: {
                drop_console: true,
                passes: 3,
                unsafe_arrows: true
            },
            mangle: {
                toplevel: true
            }
        }
    },
    plugins: [
        preact(),
        viteSingleFile()
    ],
});
