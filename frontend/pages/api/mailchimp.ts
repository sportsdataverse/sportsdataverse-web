import mailchimp from '@mailchimp/mailchimp_marketing';
import md5 from 'md5';
import { NextApiRequest, NextApiResponse } from "next";

interface ResponseData {
  message: string;
}



// eslint-disable-next-line import/no-anonymous-default-export
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  const { url, email } = req.body;

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
    res.status(200).json({
      message: `You will receive article updates at ${email}`,
    });
  } catch (err) {
    return res.send({message: "Error adding user to list"});
  }
}