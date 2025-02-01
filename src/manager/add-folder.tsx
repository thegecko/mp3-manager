import type { Track } from '../database/database-detector';
import { useBusy, useDb, useFolders } from '../context';
import { createFile, MP3_EXTENSION, newFolder } from './util';

const isMp3File = (entry: FileSystemDirectoryHandle | FileSystemFileHandle): entry is FileSystemFileHandle =>
    (entry as FileSystemFileHandle).kind === 'file' && entry.name.endsWith(MP3_EXTENSION);

const style = {
    color: 'white',
    background: 'dodgerblue',
    padding: '0.5rem',
    marginRight: '10px',
    borderRadius: '5px',
}

export const AddFolder = () => {
    const { db } = useDb();
    const { folders, updateFolders } = useFolders();
    const { updateBusy } = useBusy();

    const onAdd = async () => {
        if (!db) {
            throw new Error('No database');
        }

        const folder = await window.showDirectoryPicker({ startIn: 'music', mode: 'read' });
        if (folder) {
            try {
                updateBusy(true);
                const tracks: Track[] = [];
                for await (const [ name, entry ] of folder.entries()) {
                    if (isMp3File(entry)) {
                        const file = await entry.getFile();
                        const buffer = await file.arrayBuffer();
                        const track = await createFile(db, buffer, name);
                        if (track) {
                            tracks.push(track);
                        }
                    }
                }
                folders.unshift(newFolder(folder.name, tracks));
                updateFolders(folders);
            } finally {
                updateBusy(false);
            }
        }
    };

    const onCreate = () => {
        const name = prompt('Enter the name of the folder', 'New Folder');
        if (!name) {
            return;
        }

        folders.unshift(newFolder(name, []));
        updateFolders(folders);
    };

    return (
        <>
            <button style={style}
                onClick={onAdd}>
                Add Folder
            </button>
            <button style={style}
                onClick={onCreate}>
                Create Folder
            </button>
        </>
    );
};
