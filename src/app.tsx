import { useState, useCallback } from 'preact/hooks';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { EsysDatabase, Folder, Track } from './esys-database';
import { File } from './file';
import { FileManager } from './file-manager';
import { Footer } from './footer';

const style = {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column'
}

export interface Card {
	id: string
	text: string
    isNew?: boolean
}

export const App = () => {
    const [cards, setCards] = useState<Card[]>([])

    const [state, setState] = useState({
        dataHandle: undefined as FileSystemDirectoryHandle | undefined,
        dbHandle: undefined as FileSystemFileHandle | undefined,
        folders: [] as Folder[]
    });

    const onClick = async () => {
        // Open file picker and destructure the result the first handle
        const fileSystem = await window.showDirectoryPicker({ startIn: 'music', mode: 'readwrite' });
        if (fileSystem) {
            try {
                const rootHandle = await fileSystem.getDirectoryHandle('ESYS');
                const dataHandle = await rootHandle.getDirectoryHandle('NW-MP3');
                const dbHandle = await rootHandle.getFileHandle('PBLIST1.DAT');

                const dbFile = await dbHandle.getFile();
                const contents = await dbFile.arrayBuffer();
                const db = new EsysDatabase(contents);
                const folders = await db.getFoldersWithTracks();

                const cards: Card[] = [];
                for (const folder of folders) {
                    cards.push({ id: folder.offset.toString(), text: `${folder.name} (${folder.tracks.length})` });
                    for (const track of folder.tracks) {
                        cards.push({ id: track.id.toString(), text: `${track.artist}: ${track.name}` });
                    }
                }

                /*
            const entries = fileSystem.entries();
            const files = [];
            for await (const [name] of entries) {
                files.push(name);
            }
                */
                setState({...state, dataHandle, dbHandle, folders });
                setCards(cards);
            } catch (e) {
                alert('check this is the right folder');
            }
        }
    }

    const onNew = useCallback(() => {
        const newCard = {
            id: `new item ${cards.length}`,
            text: `new file`,
            isNew: true
        };
        setCards(prevCards => [
            ...prevCards,
            newCard
        ]);
        return newCard;
    }, [cards])

    let requestedFrame: number | undefined;
    const onMove = (dragRef: Card, hoverRef: Card): void => {
        if (requestedFrame) {
            return;
        }

        const newCards = [...cards];

        const dragIndex = newCards.indexOf(dragRef)
		const hoverIndex = newCards.indexOf(hoverRef)

        if(dragIndex < 0 || hoverIndex < 0) {
            return;
        }
        const deletedCards = newCards.splice(dragIndex, 1);
        newCards.splice(hoverIndex, 0, ...deletedCards);

        requestedFrame = requestAnimationFrame(() => {
            setCards(newCards);
            requestedFrame = undefined;
        });
	}

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

    const cardNodes = cards.map(card =>
        <File
            key={card.id}
            id={card}
            text={card.text}
            isNew={card.isNew}
            onMove={onMove}
        />
    );

    return (
        <div style={style}>
            <DndProvider backend={HTML5Backend}>
                <FileManager
                    onNew={onNew}
                    onDrop={onDrop}
                >
                    {cardNodes}
                </FileManager>
            </DndProvider>
            <Footer onSelectDrive={onClick} />
        </div>
    );
};

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
                if (item.kind === 'file') {
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