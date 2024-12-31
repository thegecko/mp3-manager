import type { Identifier, XYCoord } from 'dnd-core'
import type { FC } from 'preact/compat'
import { useRef } from 'preact/compat'
import { useDrag, useDrop } from 'react-dnd'
import { NativeTypes } from 'react-dnd-html5-backend'

const ItemTypes = {
	CARD: 'card',
}

const style = {
	border: '1px dashed gray',
	padding: '0.5rem 1rem',
	marginBottom: '.5rem',
	backgroundColor: 'white',
	cursor: 'move',
}

export interface CardProps {
	id: any
	text: string
	index: number
	isNew?: boolean
	moveCard: (dragIndex: number, hoverIndex: number) => void
	newCard: (hoverIndex: number) => void
	onDrop: (index: number, item: { files: any[] }) => void
}

interface DragItem {
	index: number
	id: string
	type: string,
	files: any[]
}

export const Card: FC<CardProps> = ({ id, text, index, isNew, moveCard, newCard, onDrop }) => {
	const ref = useRef<HTMLDivElement>(null)
	const [{ handlerId }, drop] = useDrop<
		DragItem,
		void,
		{ handlerId: Identifier | null }
	>({
		accept: [ItemTypes.CARD, NativeTypes.FILE],
		drop(item) {
			if (item.files && onDrop) {
				onDrop(id, item)
			}
		},
		collect(monitor) {
			return {
				handlerId: monitor.getHandlerId()
			}
		},
		hover(item: DragItem, monitor) {
			if (!ref.current) {
				return
			}

			if (item.index === undefined) {
				if (monitor.getItemType() === NativeTypes.FILE) {
					newCard(index)
					item.index = index
				}
				return
			}

			const dragIndex = item.index
			const hoverIndex = index

			// Don't replace items with themselves
			if (dragIndex === hoverIndex) {
				return
			}

			// Determine rectangle on screen
			const hoverBoundingRect = ref.current?.getBoundingClientRect()

			// Get vertical middle
			const hoverMiddleY =
				(hoverBoundingRect.bottom - hoverBoundingRect.top) / 2

			// Determine mouse position
			const clientOffset = monitor.getClientOffset()

			// Get pixels to the top
			const hoverClientY = (clientOffset as XYCoord).y - hoverBoundingRect.top

			// Only perform the move when the mouse has crossed half of the items height
			// When dragging downwards, only move when the cursor is below 50%
			// When dragging upwards, only move when the cursor is above 50%

			// Dragging downwards
			if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) {
				return
			}

			// Dragging upwards
			if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) {
				return
			}

			// Time to actually perform the action
			moveCard(dragIndex, hoverIndex)

			// Note: we're mutating the monitor item here!
			// Generally it's better to avoid mutations,
			// but it's good here for the sake of performance
			// to avoid expensive index searches.
			item.index = hoverIndex
		},
	})

	const [{ isDragging }, drag] = useDrag({
		type: ItemTypes.CARD,
		item: () => {
			return { id, index }
		},
		collect: (monitor: any) => ({
			isDragging: monitor.isDragging()
		})
	})

	const dragging = isDragging || isNew
	const opacity = dragging ? 0.2 : 1
	drag(drop(ref))
	return (
		<div ref={ref} style={{ ...style, opacity }} data-handler-id={handlerId}>
			{text}
		</div>
	)
}
