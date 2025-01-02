import { useState, useCallback } from "preact/hooks";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { EsysDatabase, Folder, Track } from "./esys-database";
import { Card } from "./card";
import { TargetBox } from "./target-box";

export interface Card {
	id: string
	text: string
    isNew?: boolean
}

export default function App() {
    const [cards, setCards] = useState<Card[]>([])

    const [state, setState] = useState({
        dataHandle: undefined as FileSystemDirectoryHandle | undefined,
        dbHandle: undefined as FileSystemFileHandle | undefined,
        folders: [] as Folder[],
        tracks: [] as Track[]
    });

    const onClick = async () => {
        // Open file picker and destructure the result the first handle
        const fileSystem = await window.showDirectoryPicker({ startIn: "music", mode: 'readwrite' });
        if (fileSystem) {
            try {
                const rootHandle = await fileSystem.getDirectoryHandle('ESYS');
                const dataHandle = await rootHandle.getDirectoryHandle('NW-MP3');
                const dbHandle = await rootHandle.getFileHandle('PBLIST1.DAT');

                const dbFile = await dbHandle.getFile();
                const contents = await dbFile.arrayBuffer();
                const db = new EsysDatabase(contents);
                const folders = await db.getFolders();
                const tracks = await db.getTracks();
                const folderCards = folders.map(folder => ({ id: folder.offset.toString(), text: folder.name }));
                const trackCards = tracks.map(track => ({ id: track.file, text: `${track.artist}: ${track.title} (${track.file})` }));

                /*
            const entries = fileSystem.entries();
            const files = [];
            for await (const [name] of entries) {
                files.push(name);
            }
                */
                setState({...state, dataHandle, dbHandle, folders, tracks});
                setCards([
                    ...folderCards,
                    ...trackCards
                ]);
            } catch (e) {
                alert('check this is the right folder');
            }
        }
    }

    const onNew = useCallback((id: string) => {
        setCards((prevCards: Card[]) => (
            [
                ...prevCards,
                {
                    id,
                    text: `new shit ${id}`,
                    isNew: true
                }
            ]
        ));
    }, [cards])

    const onMove = useCallback((dragIndex: number, hoverIndex: number) => {
        setCards(cards => {
            const newCards = [...cards];
            const deletedCards = newCards.splice(dragIndex, 1);
            newCards.splice(hoverIndex, 0, ...deletedCards);
            return newCards;
        });
    }, [cards])

    const onDrop = useCallback((item: { files: any[] }) => {
        if (item) {
            const files = item.files
            setCards(previous =>
                previous.map(prev => ({
                    ...prev,
                    text: !!prev.isNew ? files[0].name : prev.text,
                    isNew: false
                })
            ));
        }
    }, [])

    const cardNodes = cards.map((card, index) =>
        <Card
            key={card.id}
            id={card.id}
            index={index}
            text={card.text}
            isNew={card.isNew}
            onMove={onMove}
        />
    );

    return (
        <>
            <DndProvider backend={HTML5Backend}>
                <TargetBox
                    onNew={onNew}
                    onDrop={onDrop}
                >
                    {cardNodes}
                </TargetBox>
            </DndProvider>
            <button
                class="hover:bg-blue-400 group flex items-center rounded-md bg-blue-500 text-white text-sm font-medium pl-2 pr-3 py-2 shadow-sm"
                onClick={onClick}>
                    Select drive
            </button>
        </>
    );
}

    /*
    const saveFile = async (file: File) => {
        let id = 1;
        for (const file of state.tracks) {
            if (file.id >= id) {
                id = file.id + 1;
            }
        }

        const files = state.tracks;
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

        setState({...state, tracks: files});
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
    */