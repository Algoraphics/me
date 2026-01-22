import React, { useState } from "react";
import './styles.css';
import AboutMe from './AboutMe';
import Work from './Work';
import Art from './Art';
import ControlPanel from './ControlPanel';
import { Demo } from './Demo';
import { FullWindow, Window, TabPage, Tab, TabButtons, FixedButtons } from './styles';

declare global {
    interface Window {
        controlActivateDemo?: () => void;
        controlDeactivateDemo?: () => void;
    }
}

/* Get matching react component based on clicked tab */
const getWindow = (
    topic: string, 
    isMobile: boolean, 
    onTabChange: (tab: string) => void,
    zoomImg: string,
    setZoomImg: (img: string) => void
) => {
    if (topic === "About Me") {
        return <AboutMe isMobile={isMobile} onTabChange={onTabChange} />
    }
    else if (topic === "Work") {
        return <Work isMobile={isMobile} />
    }
    else if (topic === "Art") {
        return <Art isMobile={isMobile} onTabChange={onTabChange} zoomImg={zoomImg} setZoomImg={setZoomImg} />
    }
    else if (topic === "Demo") {
        return <Demo isMobile={isMobile} onTabChange={onTabChange} />
    }
    return <>{topic}</>;
}

const tabs = ["About Me", "Work", "Art", "Demo"];

/* Manage current tab and control panel display */
const TabGroup = (props: { isMobile: boolean; zoomImg: string; setZoomImg: (img: string) => void }) => {
    const [activeTab, setActiveTab] = useState(tabs[0]);
    const [activeDemo, setActiveDemo] = useState(false);
    const { zoomImg, setZoomImg } = props;

    React.useEffect(() => {
        const handleHidePanel = () => {
            setActiveDemo(true);
        };
        document.addEventListener("hideExplanationPanel", handleHidePanel);
        return () => {
            document.removeEventListener("hideExplanationPanel", handleHidePanel);
        };
    }, []);

    const handleTogglePanel = () => {
        setActiveDemo(prev => !prev);
    };

    const handleTabChange = (tab: string) => {
        setActiveTab(tab);
        if (tab === "Demo") {
            window.controlActivateDemo?.();
        } else {
            setActiveDemo(false);
            window.controlDeactivateDemo?.();
        }
    };
    
    return (
        <TabPage id="window" maxWidth={props.isMobile ? "625px" : "1200px"}>
            <TabButtons className="tab-buttons">
                <FixedButtons>
                    {tabs.map((type) => (
                        <Tab
                            padding={props.isMobile ? "8 12" : "8 20"}
                            border={props.isMobile ? "solid" : "none"}
                            key={type}
                            activeTab={activeTab === type}
                            onClick={() => handleTabChange(type)}
                        >
                            {type}
                        </Tab>
                    ))}
                </FixedButtons>
                <ControlPanel isMobile={props.isMobile} isActive={activeTab === "Demo"} onTogglePanel={handleTogglePanel}/>
            </TabButtons>
            <br />
            <Window id="tabwindow" demoActive={activeDemo}
                fontSize={props.isMobile ? "14px" : "17px"}
                radius={props.isMobile ? "0%" : "2%"}
            >
                {getWindow(activeTab, props.isMobile, handleTabChange, zoomImg, setZoomImg)}
            </Window>
        </TabPage>
    );
}

/* Track full page width to determine if we should resize for mobile */
const WebsiteContainer = () => {
    const [dimensions, setDimensions] = React.useState({
        height: window.innerHeight,
        width: window.innerWidth
    })
    const [zoomImg, setZoomImg] = useState("none");

    React.useEffect(() => {
        function handleResize() {
            setDimensions({
                height: window.innerHeight,
                width: window.innerWidth
            })
        }

        function handleClick() {
            setZoomImg("none");
        }

        window.addEventListener('resize', handleResize)
        document.addEventListener('click', handleClick)

        return () => {
            window.removeEventListener('resize', handleResize)
            document.removeEventListener('click', handleClick)
        }
    }, [])

    const isMobile = dimensions.width <= 1000;
    return (
        <>
            <FullWindow id="FullWindow">
                <TabGroup isMobile={isMobile} zoomImg={zoomImg} setZoomImg={setZoomImg} />
            </FullWindow>
        </>
    );
}

export class Website extends React.Component {
    render() {
        return <WebsiteContainer/>
    }
}