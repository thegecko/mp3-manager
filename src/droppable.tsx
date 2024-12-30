import {useDroppable} from '@dnd-kit/core';

export function Droppable(props) {
  const {isOver, setNodeRef} = useDroppable({
    id: props.id,
  });
  const style = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 200,
    height: 200,
    backgroundColor: isOver ? 'lightblue' : 'green',
  };
  
  
  return (
    <div ref={setNodeRef} style={style}>
      {props.children}
    </div>
  );
}