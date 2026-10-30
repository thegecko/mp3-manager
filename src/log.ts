const PREFIX = '[mp3-manager]';

export const log = (message: string, data?: unknown): void => {
    if (data === undefined) {
        console.log(`${PREFIX} ${message}`);
    } else {
        console.log(`${PREFIX} ${message}`, data);
    }
};

export const warn = (message: string, data?: unknown): void => {
    if (data === undefined) {
        console.warn(`${PREFIX} ${message}`);
    } else {
        console.warn(`${PREFIX} ${message}`, data);
    }
};

export const error = (message: string, data?: unknown): void => {
    if (data === undefined) {
        console.error(`${PREFIX} ${message}`);
    } else {
        console.error(`${PREFIX} ${message}`, data);
    }
};

export const elapsed = (start: number): string => `${Math.round(performance.now() - start)}ms`;
