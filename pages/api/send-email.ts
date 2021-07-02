import { NextApiRequest, NextApiResponse  } from 'next';

import { sendEmail } from '../../scripts/sendEmail';

export default async (req: NextApiRequest, res: NextApiResponse) => {
    if(req.method === 'POST') {
      const { name, email } = req.body;
      await sendEmail({ name, email });
      return res.status(200).end();
    }
    return res.status(404).json({
        error: {
            code: 'not_found',
            messgae: "The requested endpoint was not found or doesn't support this method."
        }
    });
}