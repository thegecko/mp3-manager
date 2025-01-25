
import { useCallback, useMemo, useState } from 'preact/hooks';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { FileContainer } from './file-container';
import { File } from './file';
import { AddFolder } from './add-folder';
import { NEW_ID, Card, buildFolders, getCards, getFiles } from './util';
import { useDb, useFolders } from '../context';
import type { Track } from '../database/database-detector';
import { DriveSelect } from '../drive-select';
import { readTags } from '../id3';

const isDataTransfer = (item: any): item is DataTransfer => item.items !== undefined;

const footerStyle = {
    height: '50px',
    display: 'flex',
    alignItems: 'center',
    background: 'lightgray',
}

export const FileManager = () => {
    const { db } = useDb();
    const { folders, updateFolders } = useFolders();
    const [cards, setCards] = useState([] as Card[]);
    const [collapsedFolder, setcollapsedFolder] = useState(undefined as number | undefined);

    // Container handlers
    const onNew = useCallback(() => {
        const newCard: Card = {
            id: NEW_ID,
            type: 'new',
            name: `add track(s)`
        };
        setCards(prevCards => [
            ...prevCards,
            newCard
        ]);
        return newCard;
    }, [cards])

    const clearNew = () => {
        const hasNew = cards.some(card => card.type === 'new');
        if (hasNew) {
            setCards(prevCards => [
                ...prevCards.filter(card => card.type !== 'new')
            ]);
        }
    };

    // File handlers
    const onHover = (dragRef?: Card): void => {
        setcollapsedFolder(dragRef?.type === 'folder' ? dragRef.id : undefined);
    };

    let requestedFrame: number | undefined;
    let dragid: number | undefined;
    let hoverid: number | undefined;
    const onMove = (dragRef: Card, hoverRef: Card): void => {
        if (requestedFrame || dragRef.id === dragid && hoverRef.id === hoverid) {
            return;
        }

        dragid = dragRef.id;
        hoverid = hoverRef.id;
        const removeIndex = cards.indexOf(dragRef)
        let insertIndex = cards.indexOf(hoverRef)

        if (removeIndex < 0 || insertIndex < 0) {
            return;
        }

        const trackCount = (folderIndex: number) => {
            let count = 0;
            for (let i = folderIndex + 1; i < cards.length; i++) {
                if (cards[i].type === 'folder') {
                    break;
                }
                count++;
            }
            return count;
        }

        let removeCount = 1;
        if (dragRef.type === 'folder') {
            const toMove = trackCount(removeIndex);
            removeCount = toMove + 1;
            if (removeIndex < insertIndex) {
                // Moving down
                insertIndex += (trackCount(insertIndex) - toMove);
            }
        }

        requestedFrame = requestAnimationFrame(() => {
            setCards(cards => {
                const newCards = [...cards];
                const deletedCards = newCards.splice(removeIndex, removeCount);
                newCards.splice(insertIndex, 0, ...deletedCards);
                return newCards;
            });
            requestedFrame = undefined;
        });
    }

    const onDrop = async (card: Card | DataTransfer) => {
        const newFolders = new Map<string, Track[]>();
        const newTracks: Track[] = [];

        if (isDataTransfer(card)) {
            const files = await getFiles(card);
            for (const { file, folder } of files) {
                const track = await createFile(file);
                if (track) {
                    if (folder) {
                        newFolders.set(folder, [...(newFolders.get(folder) || []), track]);
                    } else {
                        newTracks.push(track);
                    }
                }
            }
        }

        const folders = buildFolders(cards, { newFolders, newTracks });
        updateFolders(folders);
    };

    const onDelete = async (toDelete: Card) => {
        if (!db) {
            throw new Error('No database');
        }

        // Delete files
        let deletingTracks = false;
        for (const card of cards) {
            if (card.type === 'folder') {
                deletingTracks = toDelete.id === card.id;
            } else if (deletingTracks || toDelete.id === card.id) {
                await db.deleteFile(card.id);
            }
        }

        const folders = buildFolders(cards, { deleteId: toDelete.id });
        updateFolders(folders);
    };

    const onRename = async (toRename: Card) => {
        const newTitle = prompt('Enter new title', toRename.name);
        if (!newTitle) {
            return;
        }

        let newArtist = toRename.artist;
        if (toRename.type === 'track') {
            newArtist = prompt('Enter new artist', newArtist) || undefined;
            if (!newArtist) {
                return;
            }
        }

        // Rename card
        const newCards = [...cards];
        const card = newCards.find(card => card.id === toRename.id);
        if (card) {
            card.name = newTitle;
            card.artist = newArtist;
        }

        const folders = buildFolders(newCards);
        updateFolders(folders);
    };

    const onDownload = async (track: Card) => {
        if (!db) {
            throw new Error('No database');
        }

        // ToDO
    };

    // Support functions
    const createFile = async (file: File): Promise<Track | undefined> => {
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
            // Do this before writing which removes the tags
            const tags = await readTags(buffer);
            await db.writeFile(id, buffer, duration, audio.length);

            return {
                id,
                name: tags.title || 'unknown',
                artist: tags.artist || 'unknown',
                file: file.name
            }
        } catch (e) {
            console.error(e);
        }
    };

    // Cards
    useMemo(() => {
        const cards = getCards(folders);
        setCards(cards);
    }, [folders]);

    const filtered: Card[] = [];

    let ignore = false;
    for (const card of cards) {
        if (card.type === 'folder') {
            filtered.push(card);
            ignore = !!collapsedFolder && card.id === collapsedFolder;
        } else if (!ignore) {
            filtered.push(card);
        }
    }

    const cardNodes = filtered
        .map(card =>
            <File
                key={card.id}
                id={card}
                text={card.name}
                title={card.artist}
                type={card.type}
                onHover={onHover}
                onMove={onMove}
                onDrop={onDrop}
                onDelete={onDelete}
                onRename={onRename}
                onDownload={onDownload}
            />
        );

    return (
        <>
            <DndProvider backend={HTML5Backend}>
                <FileContainer onNew={onNew} clearNew={clearNew}>
                    {cardNodes}
                </FileContainer>
            </DndProvider>
            <div style={footerStyle}>
                <AddFolder />
                <DriveSelect />
            </div>
        </>
    );
};
