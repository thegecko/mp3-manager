const isFile = (entry: FileSystemEntry): entry is FileSystemFileEntry => entry.isFile;
const isDirectory = (entry: FileSystemEntry): entry is FileSystemDirectoryEntry => entry.isDirectory;

export const getFiles = async (transfer: DataTransfer, filter = 'mp3'): Promise<File[]> => {
    const files: File[] = [];

    const addFile = async (entry: FileSystemEntry) => {
        if (isFile(entry) && entry.name.endsWith(filter)) {
            const file = await new Promise<File>(resolve => entry.file(resolve));
            files.push(file);
        }
    };

    for (const item of transfer.items) {
        const entry = item.webkitGetAsEntry();
        if (!entry) {
            continue;
        }

        if (isFile(entry)) {
            await addFile(entry);
        } else if (isDirectory(entry)) {
            const reader = entry.createReader();
            const entries = await new Promise<FileSystemEntry[]>(resolve => reader.readEntries(resolve));
            for (const entry of entries) {
                await addFile(entry);
            }
        }
    }

    return files;
};
