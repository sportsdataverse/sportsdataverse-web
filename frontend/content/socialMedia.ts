import { SocialPlatform } from "@lib/types";
import { AiOutlineInstagram, AiOutlineTwitter } from "react-icons/ai";
import { BsFacebook, BsGithub, BsLinkedin } from "react-icons/bs";
import { FaDev } from "react-icons/fa";
import { HiMail } from "react-icons/hi";
import { SiCodepen } from "react-icons/si";

const socialMedia: SocialPlatform[] = [
  {
    title: "Twitter",
    Icon: AiOutlineTwitter,
    url: "https://twitter.com/intent/follow?screen_name=SportsDataverse",
  },
  {
    title: "Github",
    Icon: BsGithub,
    url: "https://github.com/sportsdataverse",
  },
  {
    title: "Mail",
    Icon: HiMail,
    url: "mailto:sportsdataverse@gmail.com",
  },
];

export default socialMedia;
