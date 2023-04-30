import { subscribeNewsletter } from "@lib/newsletter";
import { NextApiRequest, NextApiResponse } from "next";

interface ResponseData {
  message: string;
}



// eslint-disable-next-line import/no-anonymous-default-export
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
    try {
        const { email } = req.body;
        await subscribeNewsletter(email);
    } catch (error) {
        return res.status(500).json({ message: 'Error adding user to list' });
    }
    return res.status(200).json({ message: 'User subscribed!' });
}