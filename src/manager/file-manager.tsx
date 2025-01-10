import * as id3js from 'id3js'
import { useCallback, useMemo, useState } from 'preact/hooks';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Folder, Track } from '../database/database-detector';
import { FileContainer } from './file-container';
import { useDb, useFolders } from '../context';
import { File } from './file';
import { getFiles } from './util';

export interface Card {
    id: string
    text: string
    isNew?: boolean
}

const isDataTransfer = (item: any): item is DataTransfer => item.items !== undefined;

export const FileManager = () => {
    const { db } = useDb();
    const { folders } = useFolders();
    const [cards, setCards] = useState([] as Card[]);

    useMemo(() => {
        const cards: Card[] = [];
        for (const folder of folders) {
            cards.push({ id: folder.offset.toString(), text: `${folder.name} (${folder.offset})` });
            for (const track of folder.tracks) {
                cards.push({ id: track.id.toString(), text: `${track.artist}: ${track.name}` });
            }
        }
        setCards(cards);
    }, [folders]);

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

        if (dragIndex < 0 || hoverIndex < 0) {
            return;
        }
        const deletedCards = newCards.splice(dragIndex, 1);
        newCards.splice(hoverIndex, 0, ...deletedCards);

        requestedFrame = requestAnimationFrame(() => {
            setCards(newCards);
            requestedFrame = undefined;
        });
    }

    const onNewFile = async (file: File): Promise<Track | undefined> => {
        if (!db) {
            throw new Error('No database');
        }

        try {
            const id = await db.getNextTrackId();

            const ctx = new AudioContext();
            const audioBuffer = await file.arrayBuffer();
            const audio = await ctx.decodeAudioData(audioBuffer);
            const duration = Math.round(audio.duration * 1000);
    
            const buffer = await file.arrayBuffer();
            await db.writeFile(id, buffer, duration, audio.length);
    
            const id3 = await id3js.fromFile(file);
            return {
                id,
                name: id3?.title || 'unknown',
                file: file.name,
                artist: id3?.artist || 'unknown'
            }    
        } catch (e) {
            console.error(e);
        }
    };

    const onDrop = async (card: Card | DataTransfer) => {
        if (isDataTransfer(card)) {
            const files = await getFiles(card);
            for (const file of files) {
                const track = await onNewFile(file);
                const newCards = [...cards];
                const newCard = newCards.find(card => card.isNew);
                if (!newCard) {
                    throw new Error('No new card');
                }

                newCard.id = track?.id.toString() || 'unknown';
                newCard.text = track?.name || 'unknown';
                newCard.isNew = false;
                setCards(newCards);
            }
        }
    };

    const cardNodes = cards.map(card =>
        <File
            key={card.id}
            id={card}
            text={card.text}
            isNew={card.isNew}
            onMove={onMove}
            onDrop={onDrop}
        />
    );

    return (
        <DndProvider backend={HTML5Backend}>
            <FileContainer onNew={onNew}>
                {cardNodes}
            </FileContainer>
        </DndProvider>
    );
};
