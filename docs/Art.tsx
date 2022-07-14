import * as React from "react";
import styled from "styled-components";

const ArtSection = styled.div`
    display: block;
    flex-justify: center;
    flex-direction: column;
`

const ArtLink = styled.a`
    text-decoration: none;
    color: yellow;
    &:visited {
        color: goldenrod;
    }
    &:link {
        color: yellow;
    }
    &:hover {
        font-weight: bold;
    }
`

const ArtTextButton = styled.button`
    font-size: ${(props) => props.fontSize};
    background:none;
    border:none;
    margin:0;
    padding:0;
    cursor: pointer;
    text-decoration: underline;
    color: yellow;
    &:hover {
        font-weight: bold;
    }
`

const SlimePreview = styled.div`
    display: inline-block;
    border-style: solid;
    border-color: #212121;
    &:hover {
        border-color: yellow;
    }
    height: fit-content;
    width: ${(props) => props.width};
`

const SlimeBoxDesktop = styled.div`
    display: flex;
    padding: 0 0 15 0;
`

const SlimeBoxMobile = styled.div`
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    padding: 0 0 10 0;
`

const SlimeTextMobile = styled.div`
    padding: 5 0 0 0;
`

const SlimeTextDesktop = styled.div`
    display: inline-block;
    padding: 10 10 10 30;
    vertical-align: top;
    width: 50%;
`

const FractalText = styled.div`
    display: inline-block;
`

const FractalBox = styled.div`
  padding: 10px;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-around;
`

const FractalImg = styled.img`
  user-select: none;
  flex: 0 9%;
  margin-bottom: 2%;
  transition: transform 0.2s ease-in-out;
  ${(props) => props.isZoom && props.zoomType};
`

const FractalGallery = (props) => {
    const [zoomImg, setZoomImg] = React.useState("none");
    const targetProp = props.isMobile ? "transform: scale(3);" : "transform: scale(6);";

    const images = [];
    for (let i = 1; i <= 30; ++i) {
        if (props.isMobile) {
            i++;
        }
        let path = "PsychoPics/Screenshot (" + i + ").png";
        let id = "fractalImg" + i;
        images.push(<FractalImg key={i} id={id} src={path} height={props.isMobile ? "160" : "100"} zoomType={targetProp}
            onClick={() => { (zoomImg === id) ? setZoomImg("none") : setZoomImg(id) }} isZoom={zoomImg === id} />);
    }
    return (
        <FractalBox>
            {images}
        </FractalBox>
    );
}

const videoDimensions = { mobile: { width: "285", height: "150" }, desktop: {width : "500", height : "270"}}

const VideoElement = (props) => {
    if (props.isMobile) {
        return (
            <>
                <video id="slimeMobile" loop autoPlay height={videoDimensions.mobile.height} width={videoDimensions.mobile.width} preload="true" poster="SlimePreviewImg.JPG">
                    <source src="SlimePreviewCroppedCompress.mp4" type="video/mp4"/>
                    Your browser does not support this preview video.Click to see the full experience.
                </video >
            </>
        );
    }
    else return (
        <div>
            <video id="slimeDesktop" loop height={videoDimensions.desktop.height} width={videoDimensions.desktop.width} preload="true" poster="SlimePreviewImg.JPG"
                onMouseOver={event => event.target.play()}
                onMouseOut={event => event.target.pause()}>
                <source src="SlimePreviewCroppedCompress.mp4" type="video/mp4" />
            </video>
        </div>
    );
        
}

const Art = (props) => {
    let { isMobile, setTab } = props;

    var slimePreview = (
        <SlimePreview width={isMobile ? "285" : "500"}>
            <ArtLink href="http://www.slime-freighter.glitch.me" target="_blank">
                <VideoElement isMobile={isMobile} />
            </ArtLink>
        </SlimePreview>
    );

    var slimeText = (
        <div>
            I wanted to give viewers a sense of scale with this experience, beginning with a very grounded
            visual of "traveling down the road" which gradually increases in scope and becomes more surreal.
            <br /><br />
                    It shows the ways in which Virtual Reality can bend your expectations of what is visually possible, and then break them.
        </div>
    );

    var slimeBoxDesktop = (
        <SlimeBoxDesktop id="deskbox">
            {slimePreview}
            <SlimeTextDesktop>
                {slimeText}
            </SlimeTextDesktop>
        </SlimeBoxDesktop>
    );

    var slimeBoxMobile = (
        <SlimeBoxMobile id="mobilebox">
            {slimePreview}
            <SlimeTextMobile>
                {slimeText}
            </SlimeTextMobile>
        </SlimeBoxMobile>
    );

    return (
        <ArtSection>
            My main creative work has been these audio-visual experiences using various WebXR technologies.
            I love that users can immerse themselves to their comfort level from anywhere.
            <br /><br />
                If you have a VR headset, you can get them running in Firefox. See <ArtLink href="https://aframe.io/" target="_blank"><u>aframe.io</u></ArtLink> for more details.
            <h2>Slime Freighter</h2>
            <ArtLink href="http://www.slime-freighter.glitch.me" target="_blank"><u>Slime Freighter</u></ArtLink> is
                    an immersive VR music video set to "Side of the Road" by Big Black Delta.
            <br /><br />
            {isMobile ? slimeBoxMobile : slimeBoxDesktop}
                Assets in this video were handmade using GLSL shaders and WebGL geometry,
                and their placement is procedurally generated in Javascript, so each experience is a bit different.
            <br /><br />
                Nearly everything in the video is synchronized to the beat of the music, using a customized
                audio-reactivity component that I built for the project.
            <h2>Opal & Bismuth</h2>
            <FractalText>
                A fun side-effect of the Slime Freighter video was discovering the potential of fractal visualizations using GLSL shaders.
                    <br /><br />
                    Opal & Bismuth are my attempt to create a visualizer that will always show something new.
                    Their patterns will continue to shift and change endlessly, and can respond to user input as well. Both use the same basic algorithms, but Opal is based on circular geometry while Bismuth is rectangular.
                    <br /><br />
                    Check out <ArtLink href="http://www.psycho-bubbles.glitch.me" target="_blank"><u>their dedicated website</u></ArtLink> to see them both in VR, as well as some other small works.
                    <br /><br />
                    An interactive Bismuth preview is available on the <ArtTextButton fontSize={isMobile ? '14px' : '17px'} onClick={() => setTab("Demo")}>Demo</ArtTextButton> tab,
                    or you can browse the gallery below to see samples of both visualizers.
                    <b> Click to Zoom! </b>
                <br /><br />
            </FractalText>
            <FractalGallery isMobile={isMobile} />
        </ArtSection>
    );
}

export default Art;