import mailchimp from '@mailchimp/mailchimp_marketing';
import md5 from 'md5';
import { NextResponse } from "next/server";

interface ResponseData {
  message: string;
}



export async function POST(req: Request) {
  const { url, email } = await req.json().catch(() => ({}));

  // Set the mailchimp config with your API key and server prefix
  mailchimp.setConfig({
    apiKey: process.env.MAILCHIMP_API_KEY,
    server: process.env.MAILCHIMP_SERVER_URL,
  });

  const subscriberHash = md5(email.toLowerCase());

  // Set the Audience ID generated earlier to add email to that audience
  try {
    const response = await mailchimp.lists.addListMember(
      process.env.MAILCHIMP_AUDIENCE_ID || '',
      {
        email_address: email,
        status: "subscribed",
      }
    );
    console.log(response)
    return NextResponse.json<ResponseData>(
      {
        message: `You will receive article updates at ${email}`,
      },
      { status: 200 }
    );
  } catch (err) {
    return NextResponse.json<ResponseData>({ message: "Error adding user to list" });
  }
}
