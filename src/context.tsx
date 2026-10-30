import { createContext } from 'preact';
import { useContext, useState } from 'preact/hooks';
import { PropsWithChildren } from 'preact/compat';
import type { Database, Folder } from './database/database-detector';
import { elapsed, error, log } from './log';

export const DbContext = createContext({
    db: undefined as Database | undefined,
    updateDb: (db: Database | undefined) => { }
});

export const FoldersContext = createContext({
    folders: [] as Folder[],
    updateFolders: async (folders: Folder[]) => { }
});

export const FileSystemContext = createContext({
    fs: undefined as FileSystemDirectoryHandle | undefined,
    updateFs: (fs: FileSystemDirectoryHandle | undefined) => { }
});

export const BusyContext = createContext({
    busy: false,
    updateBusy: (busy: boolean) => { }
});

export const ContextProvider = (props: PropsWithChildren) => {
    const [busy, updateBusy] = useState(false);
    const [fs, updateFs] = useState(undefined as FileSystemDirectoryHandle | undefined);
    const [db, setDb] = useState(undefined as Database | undefined);
    const [folders, setFolders] = useState([] as Folder[]);

    const busyWrapper = async (fn: () => Promise<void>) => {
        updateBusy(true);
        try {
            await fn();
        } finally {
            updateBusy(false);
        }
    };

    const updateDb = async (db?: Database) => {
        await busyWrapper(async () => {
            setDb(db);
            const folders = db ? await db.getFolders() : [];
            setFolders(folders);
        });
    };

    const updateFolders = async (folders: Folder[]) => {
        await busyWrapper(async () => {
            if (db) {
                const start = performance.now();
                try {
                    log('database save: start', { db: db.type, folders: folders.length });
                    const saved = await db.setFolders(folders);
                    if (!saved) {
                        throw new Error('Database writer returned false');
                    }
                    log('database save: writer complete', { elapsed: elapsed(start) });
                } catch (e) {
                    error('database save: failed', { elapsed: elapsed(start), error: e });
                    alert(`Unable to save changes to the device: ${formatError(e)}`);
                }
                log('database save: reloading folders', { elapsed: elapsed(start) });
                folders = await db.getFolders();
                setFolders(folders);
                log('database save: complete', { folders: folders.length, elapsed: elapsed(start) });
            }
        });
    };

    return (
        <BusyContext.Provider value={{ busy, updateBusy }} >
            <FileSystemContext.Provider value={{ fs, updateFs }} >
                <DbContext.Provider value={{ db, updateDb }} >
                    <FoldersContext.Provider value={{ folders, updateFolders }} >
                        {props.children}
                    </FoldersContext.Provider>
                </DbContext.Provider>
            </FileSystemContext.Provider>
        </BusyContext.Provider>
    );
};

export const useBusy = () => useContext(BusyContext);
export const useFs = () => useContext(FileSystemContext);
export const useDb = () => useContext(DbContext);
export const useFolders = () => useContext(FoldersContext);

const formatError = (error: unknown): string => {
    if (error instanceof Error) {
        return error.message || error.name;
    }
    return String(error);
};
