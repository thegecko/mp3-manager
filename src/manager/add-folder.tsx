import type { Track } from '../database/database-detector';
import { useBusy, useDb, useFolders } from '../context';
import { primaryButtonStyle } from '../styles';
import { createFile, MP3_EXTENSION, newFolder } from './util';
import { elapsed, log } from '../log';

const isMp3File = (entry: FileSystemDirectoryHandle | FileSystemFileHandle): entry is FileSystemFileHandle =>
    (entry as FileSystemFileHandle).kind === 'file' && entry.name.endsWith(MP3_EXTENSION);

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
            const start = performance.now();
            try {
                log('folder upload: start', { folder: folder.name });
                updateBusy(true);
                const tracks: Track[] = [];
                for await (const [ name, entry ] of folder.entries()) {
                    if (isMp3File(entry)) {
                        log('folder upload: importing file', { name, elapsed: elapsed(start) });
                        const file = await entry.getFile();
                        const track = await createFile(db, file);
                        if (track) {
                            tracks.push(track);
                        }
                    }
                }
                log('folder upload: saving database', { folder: folder.name, tracks: tracks.length, elapsed: elapsed(start) });
                folders.unshift(newFolder(folder.name, tracks));
                await updateFolders(folders);
                log('folder upload: complete', { elapsed: elapsed(start) });
            } finally {
                updateBusy(false);
            }
        }
    };

    const onCreate = async () => {
        const name = prompt('Enter the name of the folder', 'New Folder');
        if (!name) {
            return;
        }

        folders.unshift(newFolder(name, []));
        await updateFolders(folders);
    };

    return (
        <>
            <button style={primaryButtonStyle}
                onClick={onAdd}>
                Upload Folder
            </button>
            <button style={primaryButtonStyle}
                onClick={onCreate}>
                New Folder
            </button>
        </>
    );
};
