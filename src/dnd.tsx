import {useState} from 'preact/compat';
import {DndContext, useSensor, useSensors} from '@dnd-kit/core';

import {Droppable} from './droppable';
import {Draggable} from './draggable';
import { FileSensor } from './file-sensor';

export default function App() {
  const containers = ['A', 'B', 'C'];
  const [parent, setParent] = useState(null);
  const [fileActive, setFileActive] = useState(false);

  const draggableMarkup = (
    <Draggable id="draggable">Drag me</Draggable>
  );

  const fileDraggableMarkup = (
    <Draggable id="draggableFile">FILES</Draggable>
  );

  const sensors = useSensors(
    useSensor(FileSensor, {
      bypassActivationConstraint({event, activeNode}) {
        console.log('bypassActivationConstraint', event, activeNode);
        return true;
        return activeNode.activatorNode.current?.contains(event.target);
      },
    })
  );

  const onDragEnter = (event) => {
    event.preventDefault();
    if (fileActive) {
      return;
    }

    setFileActive(true);
  }

  const onDragOver = (event) => {
    // console.log(event);
    event.preventDefault();
  }

  const onDragLeave = (event) => {
    // console.log(event);
    event.preventDefault();
  }

  const onDrop = (event) => {
    if (event.dataTransfer?.items) {
        // Use DataTransferItemList interface to access the file(s)
        [...event.dataTransfer.items].forEach((item, i) => {
            // If dropped items aren't files, reject them
            if (item.kind === "file") {
                const file = item.getAsFile();
                console.log(file);
            }
        });
    } else if (event.dataTransfer?.files) {
        // Use DataTransfer interface to access the file(s)
        [...event.dataTransfer.files].forEach((file, i) => {
            console.log(file);
        });
    }

    event.preventDefault();
  }

  return (
    <div style = {{backgroundColor: 'black', width: 800, height:800}}
      onDragEnter={e => onDragEnter(e)}
      onDragOver={e => onDragOver(e)}
      onDragLeave={e => onDragLeave(e)}
      onDrop={e => onDrop(e)}
    >
    <DndContext onDragEnd={handleDragEnd} sensors={sensors}>
      {parent === null && fileActive ? fileDraggableMarkup : null}

      {containers.map((id) => (
        // We updated the Droppable component so it would accept an `id`
        // prop and pass it to `useDroppable`
        <Droppable key={id} id={id}>
          {parent === id ? fileDraggableMarkup : 'Drop here'}
        </Droppable>
      ))}
    </DndContext>
    </div>
  );

  function handleDragEnd(event) {
    const {over} = event;

    // If the item is dropped over a container, set it as the parent
    // otherwise reset the parent to `null`
    setParent(over ? over.id : null);
  }
};