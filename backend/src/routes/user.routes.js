import {Router} from 'express'
import { loginUser, registerUser, logoutUser, updatePassword, forgotPassword, updateProfileDetails, getUsersWithDetails } from '../controller/user.controller.js';
import { verifyJWT } from '../middlewares/auth.middlewares.js'
const router = Router()

router.route('/signup').post(registerUser)

router.route("/login").post(loginUser)

router.route('/logout').get(verifyJWT, logoutUser)
router.route('/changePassword').patch(verifyJWT, updatePassword)
router.route('/forgotPassword').patch(forgotPassword)
router.route('/update-details').patch(verifyJWT, updateProfileDetails)
router.route('/user-fulldetails').get(getUsersWithDetails)
export default router