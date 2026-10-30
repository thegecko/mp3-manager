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
    busyMessage: 'Waiting...',
    updateBusy: (busy: boolean, message?: string) => { }
});

export const ContextProvider = (props: PropsWithChildren) => {
    const [busy, setBusy] = useState(false);
    const [busyMessage, setBusyMessage] = useState('Waiting...');
    const [fs, updateFs] = useState(undefined as FileSystemDirectoryHandle | undefined);
    const [db, setDb] = useState(undefined as Database | undefined);
    const [folders, setFolders] = useState([] as Folder[]);

    const updateBusy = (busy: boolean, message = 'Waiting...') => {
        setBusyMessage(message);
        setBusy(busy);
    };

    const busyWrapper = async (fn: () => Promise<void>, message = 'Waiting...') => {
        updateBusy(true, message);
        try {
            await fn();
        } finally {
            updateBusy(false);
        }
    };

    const updateDb = async (db?: Database) => {
        await busyWrapper(async () => {
            updateBusy(true, db ? 'Loading database...' : 'Disconnecting...');
            setDb(db);
            updateBusy(true, db ? 'Reading folders...' : 'Waiting...');
            const folders = db ? await db.getFolders() : [];
            setFolders(folders);
        }, db ? 'Loading database...' : 'Disconnecting...');
    };

    const updateFolders = async (folders: Folder[]) => {
        await busyWrapper(async () => {
            if (db) {
                const start = performance.now();
                try {
                    updateBusy(true, 'Writing database...');
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
                updateBusy(true, 'Reloading folders...');
                log('database save: reloading folders', { elapsed: elapsed(start) });
                folders = await db.getFolders();
                setFolders(folders);
                log('database save: complete', { folders: folders.length, elapsed: elapsed(start) });
            }
        }, 'Saving changes...');
    };

    return (
        <BusyContext.Provider value={{ busy, busyMessage, updateBusy }} >
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
