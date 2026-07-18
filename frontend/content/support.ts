import { SiKofi, SiDigitalocean } from "react-icons/si";
import { BsPaypal } from "react-icons/bs";
import { SupportMe } from "@lib/types";

// Canonical support links — mirror the org profile README
// (github.com/sportsdataverse/.github → profile/README.md).
export const KOFI_URL = "https://ko-fi.com/G2G0KJ588";
export const PAYPAL_URL = "https://www.paypal.me/SaiemGilani";
export const DO_REFERRAL_URL =
  "https://www.digitalocean.com/?refcode=38816e14651f&utm_campaign=Referral_Invite&utm_medium=Referral_Program&utm_source=badge";

const supportOptions: SupportMe[] = [
  {
    name: "Buy us a coffee",
    url: KOFI_URL,
    Icon: SiKofi,
  },
  {
    name: "DigitalOcean credit",
    url: DO_REFERRAL_URL,
    Icon: SiDigitalocean,
  },
  {
    name: "PayPal",
    url: PAYPAL_URL,
    Icon: BsPaypal,
  },
];

export default supportOptions;
