import { createContext } from 'preact';
import { useContext, useState } from 'preact/hooks';
import { PropsWithChildren } from 'preact/compat';
import type { Database, Folder } from './database/database-detector';

export const DbContext = createContext({
    db: undefined as Database | undefined,
    updateDb: (db: Database | undefined) => {}
});

export const FoldersContext = createContext({
    folders: [] as Folder[],
    updateFolders: (folders: Folder[]) => {}
});

export const DriveContext = createContext({
    drive: undefined as String | undefined,
    updateDrive: (drive: string | undefined) => {}
});

export const BusyContext = createContext({
    busy: false,
    updateBusy: (busy: boolean) => {}
});

export const ContextProvider = (props: PropsWithChildren) => {
    const [db, setDb] = useState(undefined as Database | undefined);
    const [folders, setFolders] = useState([] as Folder[]);
    const [drive, updateDrive] = useState(undefined as string | undefined);
    const [busy, updateBusy] = useState(false);

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
        <DbContext.Provider value={{ db, updateDb }} >
            <FoldersContext.Provider value={{ folders, updateFolders }} >
                <DriveContext.Provider value={{ drive, updateDrive }} >
                    <BusyContext.Provider value={{ busy, updateBusy }} >
                        {props.children}
                    </BusyContext.Provider>
                </DriveContext.Provider>
            </FoldersContext.Provider>
        </DbContext.Provider>
    );
};

export const useDb = () => useContext(DbContext);
export const useFolders = () => useContext(FoldersContext);
export const useDrive = () => useContext(DriveContext);
export const useBusy = () => useContext(BusyContext);
