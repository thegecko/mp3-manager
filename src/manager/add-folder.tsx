import type { Folder, Track } from '../database/database-detector';
import { useBusy, useDb, useFolders } from '../context';
import { primaryButtonStyle } from '../styles';
import { createFile, MP3_EXTENSION, newFolder } from './util';
import { elapsed, log } from '../log';

export interface AddFolderProps {
    onCreateFolder?: (name: string) => void | Promise<void>;
}

interface SelectedFile {
    handle: FileSystemFileHandle;
    folder: string;
}

const isMp3File = (entry: FileSystemDirectoryHandle | FileSystemFileHandle): entry is FileSystemFileHandle =>
    (entry as FileSystemFileHandle).kind === 'file' && entry.name.toLowerCase().endsWith(MP3_EXTENSION);

export const AddFolder = ({ onCreateFolder }: AddFolderProps) => {
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
                updateBusy(true, `Reading folder: ${folder.name}`);
                const selectedFiles: SelectedFile[] = [];

                const collectFiles = async (directory: FileSystemDirectoryHandle) => {
                    for await (const [ name, entry ] of directory.entries()) {
                        if (isMp3File(entry)) {
                            selectedFiles.push({ handle: entry, folder: directory.name });
                            log('folder upload: selected file', { folder: directory.name, name, elapsed: elapsed(start) });
                        }
                    }

                    for await (const entry of directory.values()) {
                        if (entry.kind === 'directory') {
                            updateBusy(true, `Reading folder: ${entry.name}`);
                            await collectFiles(entry);
                        }
                    }
                };

                await collectFiles(folder);

                if (selectedFiles.length === 0) {
                    throw new Error('No MP3 files found in the selected folder');
                }

                const tracksByFolder = new Map<string, Track[]>();
                for (const [index, { handle, folder }] of selectedFiles.entries()) {
                    updateBusy(true, `Importing ${index + 1}/${selectedFiles.length}: ${handle.name}`);
                    log('folder upload: importing file', { folder, name: handle.name, index: index + 1, total: selectedFiles.length, elapsed: elapsed(start) });
                    const file = await handle.getFile();
                    const track = await createFile(db, file);
                    if (track) {
                        tracksByFolder.set(folder, [...(tracksByFolder.get(folder) || []), track]);
                    }
                }

                const newFolders: Folder[] = [...tracksByFolder.entries()].map(([name, tracks]) => newFolder(name, tracks));

                updateBusy(true, 'Saving database...');
                log('folder upload: saving database', { folder: folder.name, folders: newFolders.length, tracks: newFolders.reduce((count, folder) => count + folder.tracks.length, 0), elapsed: elapsed(start) });
                await updateFolders([...newFolders, ...folders]);
                log('folder upload: complete', { elapsed: elapsed(start) });
            } catch (e) {
                alert(`Unable to upload folder: ${e instanceof Error ? e.message || e.name : String(e)}`);
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

        if (db?.type === 'OMG' && onCreateFolder) {
            await onCreateFolder(name);
            return;
        }

        await updateFolders([newFolder(name, []), ...folders]);
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
