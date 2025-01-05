import { useState, useCallback } from 'preact/hooks';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { detectDatabase, Database, Track } from './database/database-detector';
import { File } from './file';
import { FileManager } from './file-manager';
import { Header } from './header';
import { Footer } from './footer';
import * as id3js from 'id3js'

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
    const [cards, setCards] = useState([] as Card[]);
    const [db, setDb] = useState(undefined as Database | undefined);

    const onClick = async () => {
        // Open file picker and destructure the result
        const fileSystem = await window.showDirectoryPicker({ startIn: 'music', mode: 'readwrite' });
        if (fileSystem) {
            try {
                const database = await detectDatabase(fileSystem);
                let folders = await database.getFolders();
                await database.setFolders(folders);
                folders = await database.getFolders();

                const cards: Card[] = [];
                for (const folder of folders) {
                    cards.push({ id: folder.offset.toString(), text: `${folder.name} (${folder.offset})` });
                    for (const track of folder.tracks) {
                        cards.push({ id: track.id.toString(), text: `${track.artist}: ${track.name}` });
                    }
                }

                setDb(database);
                setCards(cards);
            } catch (e) {
                alert(e);
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

    const onDrop = async (item: { files: any[] }) => {
        if (!item || !db) {
            return;
        }

        const ctx = new AudioContext();
        const newCards = [...cards];

        for (const file of item.files) {
            try {
                const id = await db.getTrackId();

                const buffer = await file.arrayBuffer();
                const audio = await ctx.decodeAudioData(buffer);
                const duration = Math.round(audio.duration * 1000);
                await db.writeFile(id, buffer, duration);

                const id3 = await id3js.fromFile(file);

                const newCard = newCards.find(card => card.isNew);
                if (!newCard) {
                    throw new Error('No new card');
                }

                newCard.id = id.toString();
                newCard.text = id3?.title || 'unknown';
                newCard.isNew = false;
            } catch (e) {
                console.error(e);
            }
        }

        setCards(newCards);
    };

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
            <Header />
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