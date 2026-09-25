import { SiKofi, SiDigitalocean } from "react-icons/si";
import { BsPaypal } from "react-icons/bs";
import { SupportMe } from "@lib/types";
import { KOFI_URL, PAYPAL_URL, DO_REFERRAL_URL } from "./links";

// Canonical support links — mirror the org profile README
// (github.com/sportsdataverse/.github → profile/README.md). The values now
// live in content/links.ts (zero imports, so lib/email.ts can use them too);
// re-exported here so SiteFooter.tsx keeps compiling unchanged.
export { KOFI_URL, PAYPAL_URL, DO_REFERRAL_URL };

const supportOptions: SupportMe[] = [
  {
    name: "Buy us a coffee",
    url: KOFI_URL,
    Icon: SiKofi,
    platform: "kofi",
  },
  {
    name: "DigitalOcean credit",
    url: DO_REFERRAL_URL,
    Icon: SiDigitalocean,
    platform: "digitalocean",
  },
  {
    name: "PayPal",
    url: PAYPAL_URL,
    Icon: BsPaypal,
    platform: "paypal",
  },
];

export default supportOptions;
