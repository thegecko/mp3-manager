import { useState } from "preact/hooks";

interface MusicFile {
    id: number,
    name: string;
    folder?: string;
}

export default function App() {
    const [state, setState] = useState({
        dbHandle: undefined as FileSystemFileHandle | undefined,
        dataHandle: undefined as FileSystemDirectoryHandle | undefined,
        files: [] as MusicFile[]
    });
    //const [fileSystem, setFileSystem] = useState<FileSystemDirectoryHandle>();

    const onClick = async () => {
        // Open file picker and destructure the result the first handle
        const fileSystem = await window.showDirectoryPicker({ startIn: "music", mode: 'readwrite' });
        if (fileSystem) {
            try {
                const dbHandle = await fileSystem.getFileHandle('db.json');
                const dataHandle = await fileSystem.getDirectoryHandle('data');
                const db = await dbHandle.getFile()
                const contents = await db.text();
                const files: MusicFile[] = JSON.parse(contents);
                /*
            const entries = fileSystem.entries();
            const files = [];
            for await (const [name] of entries) {
                files.push(name);
            }
                */
                setState({...state, dataHandle, dbHandle, files});
            } catch (e) {
                alert('check this is the right folder');
            }
        }
    }

    const saveFile = async (file: File) => {
        let id = 1;
        for (const file of state.files) {
            if (file.id >= id) {
                id = file.id + 1;
            }
        }

        const files = state.files;
        files.push({ id, name: file.name });
        
        if (state.dbHandle) {
            const writable = await state.dbHandle.createWritable();
            await writable.write(JSON.stringify(files));
            await writable.close();
        }

        if (state.dataHandle) {
            const fileHandle = await state.dataHandle.getFileHandle(`${id}.data`, { create: true });
            const writable = await fileHandle.createWritable();
            const buffer = await file.arrayBuffer();
            await writable.write(buffer)
            await writable.close();
        }

        setState({...state, files});
    };

    const onDrop = async (event: DragEvent) => {
        event.preventDefault();

        if (event.dataTransfer?.items) {
            // Use DataTransferItemList interface to access the file(s)
            [...event.dataTransfer.items].forEach((item, i) => {
                // If dropped items aren't files, reject them
                if (item.kind === "file") {
                    const file = item.getAsFile();
                    if (file) {
                        saveFile(file);
                    }
                }
            });
        } else if (event.dataTransfer?.files) {
            // Use DataTransfer interface to access the file(s)
            [...event.dataTransfer.files].forEach((file, i) => {
                saveFile(file);
            });
        }
    }

    const onDragOver = (event: DragEvent) => {
        event.preventDefault();
    }

    const folders = state.files
        .map(file => file.folder)
        .filter((value, index, array) => array.indexOf(value) === index);

    const folderNodes = folders.map(folder => {
        const files = state.files
            .filter(file => file.folder === folder)
            .map(file => <li>{`${file.name} (data/${file.id}.data)`}</li>);
        return (
            <>
                <span>{folder || 'ROOT'}</span>
                <ul>{files}</ul>
            </>
        );
    });
    
    return (
        <>
            <button
                class="hover:bg-blue-400 group flex items-center rounded-md bg-blue-500 text-white text-sm font-medium pl-2 pr-3 py-2 shadow-sm"
                onClick={onClick}>
                    Select drive
            </button>
            <div
                class="hover:border-blue-500 hover:border-solid hover:bg-white hover:text-blue-500 group w-full flex flex-col items-center justify-center rounded-md border-2 border-dashed border-slate-300 text-sm leading-6 text-slate-900 font-medium py-3"
                id='drop_zone'
                onDrop={onDrop}
                onDragOver={onDragOver}
            >
                {folderNodes}
                Drag one or more files to this drop zone
            </div>
        </>
    );
}
