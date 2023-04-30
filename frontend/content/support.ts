import { SiBuymeacoffee } from "react-icons/si";
import { BsPaypal } from "react-icons/bs";
import { SupportMe } from "@lib/types";

const supportOptions: SupportMe[] = [
  {
    name: "Buy Me a Coffee",
    url: "https://ko-fi.com/sportsdataverse",
    Icon: SiBuymeacoffee,
  },
  {
    name: "PayPal",
    url: "https://www.paypal.me/SaiemGilani",
    Icon: BsPaypal,
  },
];

export default supportOptions;
