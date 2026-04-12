import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(fileURLToPath(import.meta.url));

export default {
    test: {
        root: rootDir,
        globals: true,
        environment: 'node',
        include: ['src/__tests__/**/*.test.ts'],
        pool: 'threads',
    },
    resolve: {
        alias: {
            vscode: resolve(rootDir, 'src/__tests__/__mocks__/vscode.ts'),
        },
    },
};
