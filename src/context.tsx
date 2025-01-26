import { createContext } from 'preact';
import { useContext, useState } from 'preact/hooks';
import { PropsWithChildren } from 'preact/compat';
import type { Database, Folder } from './database/database-detector';

export const DbContext = createContext({
    db: undefined as Database | undefined,
    updateDb: (db: Database | undefined) => { }
});

export const FoldersContext = createContext({
    folders: [] as Folder[],
    updateFolders: (folders: Folder[]) => { }
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
        busyWrapper(async () => {
            setDb(db);
            const folders = db ? await db.getFolders() : [];
            setFolders(folders);
        });
    };

    const updateFolders = async (folders: Folder[]) => {
        busyWrapper(async () => {
            if (db) {
                await db.setFolders(folders);
                folders = await db.getFolders();
                setFolders(folders);
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
