const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const port = process.env.PORT || 5000;
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.t90v0gz.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

function verifyJWT(req, res, next) {
  console.log(req.headers.authorization);
  const authHeader = req.headers.authorization;
  console.log("This is Auth Header", authHeader);
  if (!authHeader) {
    return res.status(401).send("Unauthorized Access");
  }
  const token = authHeader.split(" ")[1];

  jwt.verify(token, process.env.DB_TOKEN, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "forbidden access" });
    }
    req.decoded = decoded;

    next();
  });
}

async function run() {
  try {
    const appointmentOptionsCollection = client
      .db("doctorsPortal")
      .collection("appointmentOptions");
    const bookingsCollection = client
      .db("doctorsPortal")
      .collection("bookings");
    const usersCollection = client.db("doctorsPortal").collection("users");
    const doctorsCollection = client.db("doctorsPortal").collection("doctors");

    // NOTE: make sure you use verifyAdmin after verifyJWT
    const verifyAdmin = async (req, res, next) => {
      console.log("indide Decoded Email", req.decoded.email);
      const decodedEmail = req.decoded.email;
      const query = { email: decodedEmail };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    /***
     * API Naming Convention
     * app.get('/bookings')
     * app.get('/bookings/:id')
     * app.post('/bookings')
     * app.patch('/bookings/:id')
     * app.delete('/bookings/:id')
     */

    // Use Aggregate to query multiple collection and then merge data
    app.get("/appointmentOptions", async (req, res) => {
      const query = {};
      const date = req.query.date;
      const options = await appointmentOptionsCollection.find(query).toArray();
      // get the bookings of the provided date
      const bookingQuery = { appointmentDate: date };
      const alreadyBook = await bookingsCollection.find(bookingQuery).toArray();

      // code carefully :D
      options.forEach((option) => {
        const optionBooket = alreadyBook.filter(
          (booked) => booked.treatmen == option.name
        );
        const bookedSlots = optionBooket.map((book) => book.slot);
        const remainingSlots = option.slots.filter(
          (slot) => !bookedSlots.includes(slot)
        );
        option.slots = remainingSlots;
      });
      res.send(options);
    });

    // app.get("/vs2/appointmentOptions", async (req, res) => {
    //     const date = req.query.date;
    //     const options = await appointmentOptionsCollection.aggregate([
    //         {
    //             $lookup: {
    //                 from: "bookings",
    //                 localField:"name",
    //                 foreignField:'treatmen',
    //                 pipeline: [
    //                     {
    //                     $match:{
    //                         $expr:{
    //                             $eq:["$appointmentDate",date]
    //                         }
    //                     }
    //                     }
    //                 ],
    //                 as: "booked"

    //             }
    //         },
    //         {
    //             $project: {
    //                 name: 1,
    //                 slots: 1,
    //                 booked: {
    //                     $map: {
    //                         input: '$booked',
    //                         as: 'book',
    //                         in: '$$book.slot'
    //                     }
    //                 }
    //             }
    //         },
    //         {
    //             $project: {
    //                 name: 1,
    //                 slots: {
    //                     $setDifference: ['$slots', '$booked']
    //                 }
    //             }
    //         }
    //     ]).toArray();
    //     res.send(options);
    // })
    //    .........................................Project Query Emplymentation.....................
    app.get("/appointmentspecialty", async (req, res) => {
      const query = {};
      const result = await appointmentOptionsCollection
        .find(query)
        .project({ name: 1 })
        .toArray();
      res.send(result);
    });

    app.get("/bookings", async (req, res) => {
      const email = req.query.email;
      //   const decodedEmail = req.decoded.email;

      //   if (email !== decodedEmail) {
      //     return res.status(403).send({ message: "forbidden access" });
      //   }

      const query = { email: email };
      const bookings = await bookingsCollection.find(query).toArray();
      console.log("booking details", bookings);
      res.send(bookings);
    });

    app.post("/bookings", async (req, res) => {
      const booking = req.body;
      const query = {
        appointmentDate: booking.appointmentDate,
        treatmen: booking.treatmen,
        email: booking.email,
      };
      const alreadyBook = await bookingsCollection.find(query).toArray();
      if (alreadyBook.length) {
        const message = `You already have a booking on ${booking.treatmen} Date:- ${booking.appointmentDate}`;
        return res.send({ acknowledged: false, message });
      }
      const result = await bookingsCollection.insertOne(booking);
      res.send(result);
    });
    //require("crypto").randomBytes(64).toString('hex')  ...
    app.get("/jwt", async (req, res) => {
      const email = req.query.email;
      const query = {
        email: email,
      };
      const user = await usersCollection.findOne(query);
      if (user) {
        const token = jwt.sign({ email }, process.env.DB_TOKEN, {
          expiresIn: "1h",
        });
        return res.send({ accessToken: token });
      }
      res.status(403).send({ accessToken: "" });
      console.log(user);
    });

    app.get("/users", async (req, res) => {
      const query = {};
      const result = await usersCollection.find(query).toArray();
      res.send(result);
    });
    app.get("/users/admin/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      res.send({ isAdmin: user?.role === "admin" });
    });

    app.put("/users/admin/:id", async (req, res) => {
      // const decodedEmail = req.decoded.email;
      // const query = { email: decodedEmail }
      // const user = await usersCollection.findOne(query);
      // if (user?.role !== 'admin') {
      //     return res.status(403).send({ message: "forbidden access" })
      // }
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await usersCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.send(result);
    });
    // app.put("/users/admin/:id", verifyJWT, verifyAdmin, async (req, res) => {
    //   // const decodedEmail = req.decoded.email;
    //   // const query = { email: decodedEmail }
    //   // const user = await usersCollection.findOne(query);
    //   // if (user?.role !== 'admin') {
    //   //     return res.status(403).send({ message: "forbidden access" })
    //   // }
    //   const id = req.params.id;
    //   const filter = { _id: ObjectId(id) };
    //   const options = { upsert: true };
    //   const updateDoc = {
    //     $set: {
    //       role: "admin",
    //     },
    //   };
    //   const result = await usersCollection.updateOne(
    //     filter,
    //     updateDoc,
    //     options
    //   );
    //   res.send(result);
    // });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });
    // app.get("/doctors", verifyJWT, verifyAdmin, async (req, res) => {
    //   const query = {};
    //   const doctors = await doctorsCollection.find(query).toArray();
    //   res.send(doctors);
    // });
    app.get("/doctors", async (req, res) => {
      const query = {};
      const doctors = await doctorsCollection.find(query).toArray();
      res.send(doctors);
    });
    // app.delete("/doctors", verifyJWT, verifyAdmin, async (req, res) => {
    //   const email = req.query.email;
    //   const query = { email };
    //   const result = await doctorsCollection.deleteOne(query);
    //   res.send(result);
    // });
    app.delete("/doctors", async (req, res) => {
      const email = req.query.email;
      const query = { email };
      const result = await doctorsCollection.deleteOne(query);
      res.send(result);
    });
    // app.post("/doctors", verifyJWT, verifyAdmin, async (req, res) => {
    //   const doctor = req.body;
    //   const result = await doctorsCollection.insertOne(doctor);
    //   res.send(result);
    // });
    app.post("/doctors", async (req, res) => {
      const doctor = req.body;
      const result = await doctorsCollection.insertOne(doctor);
      res.send(result);
    });
  } finally {
  }
}
run().catch(console.log);

app.get("/", async (req, res) => {
  res.send("Doctors Portal is Running ");
});

app.listen(port, () => {
  console.log(`Doctors Portal is Running on ${port}`);
});
