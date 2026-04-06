import * as React from "react";
import styled from "styled-components";
import { TabLink, ExternalLink, RoundedImage, CenteredImage, TextSection } from "./styles";
import './emoji/blob-emoji.css';

const IntroRow = styled.div`
    display: flex;
    align-items: flex-start;
    gap: 20px;
`

const DeskFace = styled(RoundedImage)`
    flex-shrink: 0;
`
const MobileTextSection = styled.div`
    flex-direction: column;
    justify-content: center;
    flex-wrap: wrap;
    flex: 1 1 auto;
`

const MobileWrap = styled.div`
`

const TopLevel = styled.div`
    padding: 0 0 30 0;
`

const ContactIcons = styled.div`
    display: flex;
    align-items: center;
    gap: 20px;
    margin: 15px 0;
`

const ContactLink = styled.a`
    display: inline-flex;
    transition: transform 0.2s ease;
    &:hover {
        transform: scale(1.15);
    }
    svg {
        width: 36px;
        height: 36px;
        fill: yellow;
    }
`

var IntroTextBrief = () => (
    <TextSection>
        Hi! <img className="blob-emoji" src="emoji/blob/waving hand.svg" alt="👋" />
        <br />
                My name is Ethan Rabb. I'm a Software Engineer with 10+ years in industry and a passion for creative programming projects.
        <h2>What kind of work do you do?</h2>
                        I've done Full Stack feature work in AdTech, Aviation, Construction, Healthcare, and Robotics.
        <br /><br />
                        I love novelty, and I'm always looking for new fields and technologies where I can use my programming skills.
        <br />
    </TextSection>
);

var IntroTextRest = (props: { onTabChange: (tab: string) => void }) => (
    <TextSection>
                        Currently I'm most interested in Full Stack development, but open to any opportunity that catches my eye. I'm excited by innovation and anything helping make the world a better place to live in.
        <br /><br />
                        For a full Resume and more detail about my work, see <TabLink onClick={() => props.onTabChange("Work")}>Work</TabLink>.
    </TextSection>
);

var IntroText = (props: { onTabChange: (tab: string) => void }) => (
    <TextSection>
        Hi! <img className="blob-emoji" src="emoji/blob/waving hand.svg" alt="👋" />
        <br /><br />
                My name is Ethan Rabb. I'm a Software Engineer with 10+ years in industry and a passion for creative programming projects.
        <h2>What kind of work do you do?</h2>
                        I've done Full Stack work in AdTech, Aviation, Healthcare,and Robotics.
                        I love novelty, and I'm always looking for new fields and technologies where I can use my programming skills.
        <br /><br />
                        Currently I'm most interested in Full Stack development, but open to any opportunity that catches my eye. I'm excited by innovation and anything helping make the world a better place to live in.
        <br /><br />
                        For a full Resume and more detail about my work, see <TabLink onClick={() => props.onTabChange("Work")}>Work</TabLink>.
    </TextSection>
);

var AboutIntroDesktop = (props: { onTabChange: (tab: string) => void }) => (
    <>
        <IntroRow>
            <DeskFace src="Headshot.jpg" title="It me" height="320"></DeskFace>
            <IntroTextBrief />
        </IntroRow>
        <IntroTextRest onTabChange={props.onTabChange} />
    </>
);

var AboutIntroMobile = (props: { onTabChange: (tab: string) => void }) => (
    <MobileTextSection>
        <MobileWrap>
            <CenteredImage src="Headshot.jpg" title="It me" height="270"></CenteredImage>
        </MobileWrap>
        <IntroText onTabChange={props.onTabChange}/>
    </MobileTextSection>
);

var Additional = (props: { onTabChange: (tab: string) => void }) => (
    <TextSection>
        <h2>What's going on with the background?</h2>
                In my free time, I like to explore the limits of code as an art form. The background to this website is one of my creations!
                You can play around with it at <TabLink onClick={() => props.onTabChange("Demo")}>Demo</TabLink>, or find more examples and info at <TabLink onClick={() => props.onTabChange("Art")}>Art</TabLink>.
        <br /><br />
                I'm interested in ideas like procedural generation, immersion, artificial intelligence, and emergent interaction, and how these concepts engage a viewer.
        <h2>Do you have any other interests?</h2>
                Definitely! I have plenty of non-programming hobbies and interests.
        <br /><br /><b>Things I do outside:</b> Climbing, Hiking, Frisbee Golf, Kayaking, Camping, Swimming, Biking, Tennis, Pickleball
        <br /><br /><b>Topics I could talk about for hours:</b> Nature, Movies/TV, Local Restaurants & Bars, Writing, Basketball, Meteorology, Investing, Gaming, Cooking, Robotics, Space
        <h2>What's the best way to reach you?</h2>
                Here's some icons.
        <ContactIcons>
            <ContactLink href="mailto:ethanrabb@gmail.com" title="Email">
                <svg style={{width: 46, height: 46}} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
            </ContactLink>
            <ContactLink href="https://github.com/Algoraphics" target="_blank" rel="noopener noreferrer" title="GitHub">
                <svg style={{width: 41, height: 41}} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.607.069-.607 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"/></svg>
            </ContactLink>
            <ContactLink href="https://www.linkedin.com/in/ethan-rabb-6b517828/" target="_blank" rel="noopener noreferrer" title="LinkedIn">
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
            </ContactLink>
        </ContactIcons>
                Let's chat!
    </TextSection>
);

const AboutMe = (props: { isMobile: boolean; onTabChange: (tab: string) => void }) => {
    let { isMobile, onTabChange } = props;
    return (
        <TopLevel>
            {isMobile ? <AboutIntroMobile onTabChange={onTabChange} /> : <AboutIntroDesktop onTabChange={onTabChange}/>}
            <Additional onTabChange={onTabChange}/>
        </TopLevel>
    );
}

export default AboutMe;
