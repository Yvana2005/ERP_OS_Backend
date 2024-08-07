const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const axios = require("axios");
require("dotenv").config();
const moment = require("moment");

const bcrypt = require("bcrypt");
const saltRounds = 10;

const jwt = require("jsonwebtoken");
const secret = process.env.JWT_SECRET;

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Cherche d'abord comme utilisateur
    let user = await prisma.user.findUnique({
      where: {
        email: email
      }
    });

    // Si ce n'est pas un utilisateur, cherchez comme client
    if (!user) {
      user = await prisma.customer.findUnique({
        where: {
          email: email // Utilisez `username` pour la recherche de client
        }
      });
    }

    // Vérifiez le mot de passe pour l'utilisateur trouvé
    if (user && bcrypt.compareSync(password, user.password)) {
      // Obtenez les permissions basées sur le rôle de l'utilisateur (si applicable)
      let permissions = [];
      if (user.role) {
        const role = await prisma.role.findUnique({
          where: {
            name: user.role
          },
          include: {
            rolePermission: {
              include: {
                permission: true
              }
            }
          }
        });
        permissions = role.rolePermission.map((rp) => rp.permission.name);
      }

      // Créez un token JWT
      const token = jwt.sign(
        { sub: user.id, permissions, role: user.role },
        secret,
        { expiresIn: "24h" }
      );

      // Supprimez le mot de passe avant de renvoyer les informations de l'utilisateur
      const { password, ...userWithoutPassword } = user;

      return res.json({
        ...userWithoutPassword,
        token
      });
    } else {
      return res
        .status(400)
        .json({ message: "Username or password is incorrect" });
    }
  } catch (error) {
    console.error("Backend error:", error);
    res.status(500).json({ message: error.message });
  }
};

const register = async (req, res) => {
  try {
    const join_date = new Date(req.body.join_date).toISOString().split("T")[0];
    const leave_date = new Date(req.body.leave_date)
      .toISOString()
      .split("T")[0];

    const hash = await bcrypt.hash(req.body.password, saltRounds);
    const createUser = await prisma.user.create({
      data: {
        username: req.body.username,
        password: hash,
        role: req.body.role,
        email: req.body.email,
        salary: parseInt(req.body.salary),
        join_date: new Date(join_date),
        leave_date: new Date(leave_date),
        id_no: req.body.id_no,
        department: req.body.department,
        phone: req.body.phone,
        address: req.body.address,
        blood_group: req.body.blood_group,
        image: req.body.image,
        status: req.body.status,
        designation: {
          connect: {
            id: Number(req.body.designation_id)
          }
        }
      }
    });
    // données a envoyer a l'application de laravel
    // const userDataForLaravel = {
    //   name: req.body.username,
    //   email: req.body.email,
    //   password: req.body.password,
    //   role_id: 1, // Mettez le rôle souhaité ici
    //   phone: req.body.phone,
    //   gender: 'Homme',
    //   adress: req.body.address,
    //   created_at: moment().format("YYYY-MM-DD HH:mm:ss"),
    //   updated_at: moment().format("YYYY-MM-DD HH:mm:ss")
    // };

    const { password, ...userWithoutPassword } = createUser;

    // Envoyer les données à l'API de votre application Laravel
    // const laravelApiUrl = "http://127.0.0.1:8000/api/users/register";
    // console.log("Sending data to Laravel API:", userDataForLaravel);

    // const response = await axios.post(laravelApiUrl, userDataForLaravel);
    // console.log("Received response from Laravel API:", response.data);

    res.json(userWithoutPassword);
  } catch (error) {
    console.error(
      "Error in register function:",
      error.response ? error.response.data : error.message
    );
    res.status(500).json(error.response ? error.response.data : error.message);
  }
};

const getAllUser = async (req, res) => {
  if (req.query.query === "all") {
    try {
      const allUser = await prisma.user.findMany({
        include: {
          saleInvoice: true
        }
      });
      res.json(
        allUser
          .map((u) => {
            const { password, ...userWithoutPassword } = u;
            return userWithoutPassword;
          })
          .sort((a, b) => a.id - b.id)
      );
    } catch (error) {
      res.status(500).json(error.message);
    }
  } else if (req.query.status === "false") {
    try {
      const allUser = await prisma.user.findMany({
        where: {
          status: false
        },
        include: {
          saleInvoice: true
        }
      });
      res.json(
        allUser
          .map((u) => {
            const { password, ...userWithoutPassword } = u;
            return userWithoutPassword;
          })
          .sort((a, b) => a.id - b.id)
      );
    } catch (error) {
      res.status(500).json(error.message);
    }
  } else {
    try {
      const allUser = await prisma.user.findMany({
        where: {
          status: true
        },
        include: {
          saleInvoice: true
        }
      });
      res.json(
        allUser

          .map((u) => {
            const { password, ...userWithoutPassword } = u;
            return userWithoutPassword;
          })
          .sort((a, b) => a.id - b.id)
      );
    } catch (error) {
      res.status(500).json(error.message);
    }
  }
};

const getSingleUser = async (req, res) => {
  const singleUser = await prisma.user.findUnique({
    where: {
      id: Number(req.params.id)
    },
    include: {
      saleInvoice: true
    }
  });
  const id = parseInt(req.params.id);

  // only allow admins and owner to access other user records
  // console.log(id !== req.auth.sub && !req.auth.permissions.includes("viewUser"));
  if (id !== req.auth.sub && !req.auth.permissions.includes("viewUser")) {
    return res
      .status(401)
      .json({ message: "Unauthorized. You are not an admin" });
  }

  if (!singleUser) return;
  const { password, ...userWithoutPassword } = singleUser;
  res.json(userWithoutPassword);
};

const updateSingleUser = async (req, res) => {
  const id = parseInt(req.params.id);
  // only allow admins and owner to edit other user records
  // console.log(
  //   id !== req.auth.sub && !req.auth.permissions.includes("updateUser")
  // );
  if (id !== req.auth.sub && !req.auth.permissions.includes("updateUser")) {
    return res.status(401).json({
      message: "Unauthorized. You can only edit your own record."
    });
  }
  try {
    // admin can change all fields
    if (req.auth.permissions.includes("updateUser")) {
      const hash = await bcrypt.hash(req.body.password, saltRounds);
      const join_date = new Date(req.body.join_date)
        .toISOString()
        .split("T")[0];
      const leave_date = new Date(req.body.leave_date)
        .toISOString()
        .split("T")[0];
      const updateUser = await prisma.user.update({
        where: {
          id: Number(req.params.id)
        },
        data: {
          username: req.body.username,
          password: hash,
          role: req.body.role,
          email: req.body.email,
          salary: parseInt(req.body.salary),
          join_date: new Date(join_date),
          leave_date: new Date(leave_date),
          id_no: req.body.id_no,
          department: req.body.department,
          phone: req.body.phone,
          address: req.body.address,
          blood_group: req.body.blood_group,
          image: req.body.image,
          status: req.body.status,
          designation: {
            connect: {
              id: Number(req.body.designation_id)
            }
          }
        }
      });
      const { password, ...userWithoutPassword } = updateUser;
      res.json(userWithoutPassword);
    } else {
      // owner can change only password
      const hash = await bcrypt.hash(req.body.password, saltRounds);
      const updateUser = await prisma.user.update({
        where: {
          id: Number(req.params.id)
        },
        data: {
          password: hash
        }
      });
      const { password, ...userWithoutPassword } = updateUser;
      res.json(userWithoutPassword);
    }
  } catch (error) {
    res.status(500).json(error.message);
  }
};

const deleteSingleUser = async (req, res) => {
  // const id = parseInt(req.params.id);
  // only allow admins to delete other user records
  if (!req.auth.permissions.includes("deleteUser")) {
    return res
      .status(401)
      .json({ message: "Unauthorized. Only admin can delete." });
  }
  try {
    const deleteUser = await prisma.user.update({
      where: {
        id: Number(req.params.id)
      },
      data: {
        status: req.body.status
      }
    });
    res.json({ message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json(error.message);
  }
};

module.exports = {
  login,
  register,
  getAllUser,
  getSingleUser,
  updateSingleUser,
  deleteSingleUser
};
