import { useState } from "preact/hooks";
import { EsysDatabase, Folder, Track } from "./esys-database";

import update from 'immutability-helper'
import { useCallback } from 'preact/compat'
import { Card } from "./card";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

const style = {
	width: 400,
}

export interface Item {
	id: number
	text: string
    isNew?: boolean
}

export interface ContainerState {
	cards: Item[]
}

export default function App() {
    const [cards, setCards] = useState([
        {
            id: 1,
            text: 'Write a cool JS library',
        },
        {
            id: 2,
            text: 'Make it generic enough',
        },
        {
            id: 3,
            text: 'Write README',
        },
        {
            id: 4,
            text: 'Create some examples',
        },
        {
            id: 5,
            text: 'Spam in Twitter and IRC to promote it (note that this element is taller than the others)',
        },
        {
            id: 6,
            text: '???',
        },
        {
            id: 7,
            text: 'PROFIT',
        },
    ])

    const moveCard = useCallback((dragIndex: number, hoverIndex: number) => {
        setCards((prevCards: Item[]) =>
            update(prevCards, {
                $splice: [
                    [dragIndex, 1],
                    [hoverIndex, 0, prevCards[dragIndex] as Item],
                ],
            }),
        )
    }, [])

    const newCard = useCallback((hoverIndex: number) => {
        setCards((prevCards: Item[]) =>
            update(prevCards, {
                $splice: [
                    [prevCards.length + 1, 1],
                    [hoverIndex, 0,                 {
                        id: prevCards.length + 1,
                        text: "new shit",
                        isNew: true
                    } as Item],
                ],
            }),
        )
    }, [])

    const renderCard = useCallback(
        (card: Item, index: number) => {
            return (
                <Card
                    key={card.id}
                    index={index}
                    id={card.id}
                    text={card.text}
                    isNew={card.isNew}
                    moveCard={moveCard}
                    newCard={newCard}
                    onDrop={handleFileDrop}
                />
            )
        },
        [],
    )

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
                /*
            const entries = fileSystem.entries();
            const files = [];
            for await (const [name] of entries) {
                files.push(name);
            }
                */
                setState({...state, dataHandle, dbHandle, folders, tracks});
            } catch (e) {
                alert('check this is the right folder');
            }
        }
    }

    const folderNodes = state.folders.map(folder => (        
        <>
            <span>{folder.name} {folder.offset}</span>
        </>
    ));

    const trackNodes = state.tracks.map(track => (        
        <>
            <span>{track.artist}: {track.title} ({track.file})</span>
        </>
    ));

    const handleFileDrop = useCallback((id: number, item: { files: any[] }) => {
        if (item) {
            const files = item.files
            setCards(previous =>
                previous.map(prev => ({
                    ...prev,
                    text: prev.id === id ? files[0].name : prev.text,
                    isNew: false
                })
            ));
        }
    }, [])

    return (
        <>
            <DndProvider backend={HTML5Backend}>
                <div style={style}>{cards.map((card, i) => renderCard(card, i))}</div>
            </DndProvider>
            <button
                class="hover:bg-blue-400 group flex items-center rounded-md bg-blue-500 text-white text-sm font-medium pl-2 pr-3 py-2 shadow-sm"
                onClick={onClick}>
                    Select drive
            </button>
            <div
                class="hover:border-blue-500 hover:border-solid hover:bg-white hover:text-blue-500 group w-full flex flex-col items-center justify-center rounded-md border-2 border-dashed border-slate-300 text-sm leading-6 text-slate-900 font-medium py-3"
            >
                {folderNodes}
                {trackNodes}
            </div>
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