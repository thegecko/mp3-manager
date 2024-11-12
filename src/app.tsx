import { useState } from "preact/hooks";

export default function App() {
    const [state, setState] = useState({
        fileSystem: undefined as FileSystemDirectoryHandle | undefined,
        files: [] as string[]
    });
    //const [fileSystem, setFileSystem] = useState<FileSystemDirectoryHandle>();

    const onClick = async () => {
        // Open file picker and destructure the result the first handle
        const fileSystem = await window.showDirectoryPicker({ startIn: "music", mode: 'readwrite' });
        if (fileSystem) {
            const entries = fileSystem.entries();
            const files = [];
            for await (const [name] of entries) {
                files.push(name);
            }
            setState({...state, fileSystem, files});
        }
    }

    const saveFile = async (file: File) => {
        console.log(file.name);
        if (state.fileSystem) {
            const fileHandle = await state.fileSystem.getFileHandle(file.name, { create: true });
            const writable = await fileHandle.createWritable();
            const buffer = await file.arrayBuffer();
            await writable.write(buffer)
            await writable.close();
        }
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

    const fileNodes = state.files.map((file) => <li>{file}</li>);

    return (
        <div class="text-slate-700 dark:text-slate-500">
            <button onClick={onClick}>Select drive</button>
            <ul>{fileNodes}</ul>
            <div
                id='drop_zone'
                onDrop={onDrop}
                onDragOver={onDragOver}
            >
                <p class="text-lg font-medium">Drag one or more files to this <i>drop zone</i>.</p>
            </div>
        </div>
    );
}
