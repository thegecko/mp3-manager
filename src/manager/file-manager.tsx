import * as id3js from 'id3js'
import { useCallback, useMemo, useState } from 'preact/hooks';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Folder, Track } from '../database/database-detector';
import { FileContainer } from './file-container';
import { useDb, useFolders } from '../context';
import { File } from './file';
import { getFiles } from './util';

interface Card {
    id: number;
    type: 'folder' | 'track' | 'new';
    name: string;
    artist?: string;
    file?: string;
}

const isDataTransfer = (item: any): item is DataTransfer => item.items !== undefined;
const folderToCard = (folder: Folder): Card => ({
    id: folder.offset,
    type: 'folder',
    name: folder.name
});
const trackToCard = (track: Track): Card => ({
    id: track.id,
    type: 'track',
    name: track.name,
    artist: track.artist,
    file: track.file
});
const cardToTrack = (card: Card): Track => ({
    id: card.id,
    name: card.name,
    artist: card.artist || '',
    file: card.file || ''
});
const newFolder = (name: string, tracks: Track[] = []): Folder => ({
    name,
    offset: -1,
    tracks
});

const NEW_CARD_ID = -99;

export const FileManager = () => {
    const { db } = useDb();
    const { folders, updateFolders } = useFolders();
    const [cards, setCards] = useState([] as Card[]);

    useMemo(() => {
        const cards: Card[] = [];
        for (const folder of folders) {
            cards.push(folderToCard(folder));
            for (const track of folder.tracks) {
                cards.push(trackToCard(track));
            }
        }
        setCards(cards);
    }, [folders]);

    const onNew = useCallback(() => {
        const newCard: Card = {
            id: NEW_CARD_ID,
            type: 'new',
            name: `add track(s)`
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
        const newFolders = new Map<string, Track[]>();
        const newTracks: Track[] = [];

        if (isDataTransfer(card)) {
            const files = await getFiles(card);
            for (const { file, folder } of files) {
                const track = await onNewFile(file);
                if (track) {
                    if (folder) {
                        newFolders.set(folder, [...(newFolders.get(folder) || []), track]);
                    } else {
                        newTracks.push(track);
                    }
                }
            }
        } else {
            newTracks.push(cardToTrack(card));
        }

        const folders: Folder[] = [];

        let currentFolder: Folder | undefined;
        let nextFolders: Folder[] = [];
        for (const card of cards) {
            switch (card.type) {
                case 'folder': {
                    if (currentFolder) {
                        folders.push(currentFolder);
                    }
                    if (nextFolders) {
                        folders.push(...nextFolders);
                        nextFolders = [];
                    }
                    currentFolder = newFolder(card.name);
                    break;
                }
                case 'track': {
                    if (currentFolder) {
                        currentFolder.tracks.push(cardToTrack(card));
                    }
                    break;
                }
                case 'new': {
                    if (currentFolder) {
                        currentFolder.tracks.push(...newTracks);
                    }
                    if (newFolders.size > 0) {
                        nextFolders = [...newFolders.keys()].map(name => newFolder(name, newFolders.get(name)));
                    }
                    break;
                }
            }
        }

        if (currentFolder) {
            folders.push(currentFolder);
        }
        if (nextFolders) {
            folders.push(...nextFolders);
        }

        updateFolders(folders);
    };

    const onDelete = async (remove: Card) => {
        if (!db) {
            throw new Error('No database');
        }

        if (remove.type === 'track') {
            await db.deleteFile(remove.id);
        }

        const folders: Folder[] = [];
        let currentFolder: Folder | undefined;
        for (const card of cards) {
            if (card.id === remove.id) {
                continue;
            }

            switch (card.type) {
                case 'folder': {
                    if (currentFolder) {
                        folders.push(currentFolder);
                    }
                    currentFolder = newFolder(card.name);
                    break;
                }
                case 'track': {
                    if (currentFolder) {
                        currentFolder.tracks.push(cardToTrack(card));
                    }
                    break;
                }
            }
        }

        if (currentFolder) {
            folders.push(currentFolder);
        }

        updateFolders(folders);
    };

    const cardNodes = cards.map(card =>
        <File
            key={card.id}
            id={card}
            text={card.name}
            type={card.type}
            onMove={onMove}
            onDrop={onDrop}
            onDelete={onDelete}
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
