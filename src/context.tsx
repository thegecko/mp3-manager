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

export const ContextProvider = (props: PropsWithChildren) => {
    const [db, setDb] = useState(undefined as Database | undefined);
    const [folders, setFolders] = useState([] as Folder[]);

    const updateDb = (db: Database) => setDb(db);
    const updateFolders = (folders: Folder[]) => setFolders(folders);

    return (
        <DbContext.Provider value={{ db, updateDb }} >
            <FoldersContext.Provider value={{ folders, updateFolders }} >
                {props.children}
            </FoldersContext.Provider>
        </DbContext.Provider>
    );
};

export const useDb = () => useContext(DbContext);
export const useFolders = () => useContext(FoldersContext);
