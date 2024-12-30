import {useDraggable} from '@dnd-kit/core';

export function Draggable(props) {
  const {attributes, listeners, setNodeRef, transform} = useDraggable({
    id: props.id,
  });
  const style = transform ? {
    backgroundColor: 'yellow',
    margin: 20,
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : {
    backgroundColor: 'red',
  };

  
  return (
    <button ref={setNodeRef} style={style} {...listeners} {...attributes}>
      {props.children}
    </button>
  );
}