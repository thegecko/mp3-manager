import { render } from 'preact';
import { App } from './app';

const container = document.getElementById('root') as Element;
render(<App />, container);
