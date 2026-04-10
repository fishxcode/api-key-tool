import { useEffect } from 'react';
import Log from "./pages/Log";
import FooterBar from "./components/FooterBar";
import { applySeo, getHomeSeo } from './helpers/seo';
import './App.css';

function App() {
    useEffect(() => {
        applySeo(getHomeSeo());
    }, []);

    return (
        <div className="App-body">
            <Log />
            <FooterBar />
        </div>
    );
}

export default App;
