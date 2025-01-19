import { render } from 'preact';
import { ContextProvider } from './context';
import { App } from './app';

const wrapper =
    <ContextProvider>
        <App />
    </ContextProvider>
;

const container = document.getElementById('root') as Element;
render(wrapper, container);
