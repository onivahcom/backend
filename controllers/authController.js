import axios from "axios";
import { oauth2client } from "../utils/googleConfig.js";



const googleLogin = async (req, res) => {

    try {
        const { code } = req.query;

        if (!code) {
            return res.status(400).send({ message: "Authorization code is required." });
        }

        const { tokens } = await oauth2client.getToken(code);
        oauth2client.setCredentials(tokens);

        const userRes = await axios.get(`https://www.googleapis.com/oauth2/v1/userinfo?alt=json&access_token=${tokens.access_token}`);
        const { email, name, picture } = userRes.data;

        return res.status(200).json({ message: "success", email, name, picture });

    } catch (error) {
        console.error("Error during Google login:", error);
        return res.status(500).send({ message: "Internal server error" });
    }
};

export default googleLogin;
