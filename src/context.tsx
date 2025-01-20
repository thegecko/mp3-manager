import { createContext } from 'preact';
import { useContext, useState } from 'preact/hooks';
import { PropsWithChildren } from 'preact/compat';
import type { Database, Folder } from './database/database-detector';

export const DbContext = createContext({
    db: undefined as Database | undefined,
    updateDb: (db: Database) => {}
});

export const FoldersContext = createContext({
    folders: [] as Folder[],
    updateFolders: (folders: Folder[]) => {}
});

export const DriveContext = createContext({
    drive: undefined as String | undefined,
    updateDrive: (drive: string) => {}
});

export const ContextProvider = (props: PropsWithChildren) => {
    const [db, setDb] = useState(undefined as Database | undefined);
    const [folders, setFolders] = useState([] as Folder[]);
    const [drive, setDrive] = useState(undefined as String | undefined);

    const updateDb = async (db: Database) => {
        setDb(db);
        const folders = await db.getFolders();
        setFolders(folders);
    };

    const updateFolders = async (folders: Folder[]) => {
        if (db) {
            await db.setFolders(folders);
            folders = await db.getFolders();
            setFolders(folders);
        }
    };

    const updateDrive = async (drive: string) => {
        setDrive(drive);
    };

    return (
        <DbContext.Provider value={{ db, updateDb }} >
            <FoldersContext.Provider value={{ folders, updateFolders }} >
                <DriveContext.Provider value={{ drive, updateDrive }} >
                    {props.children}
                </DriveContext.Provider>
            </FoldersContext.Provider>
        </DbContext.Provider>
    );
};

export const useDb = () => useContext(DbContext);
export const useFolders = () => useContext(FoldersContext);
export const useDrive = () => useContext(DriveContext);
