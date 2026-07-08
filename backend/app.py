from flask import Flask, request, jsonify
from tensorflow.keras.models import load_model
import joblib
import numpy as np
import pandas as pd
import json
import os
from flask_cors import CORS
import hashlib
import io

from flask import send_from_directory

def compute_file_hash(file_bytes):
    return hashlib.sha256(file_bytes).hexdigest()


#url fix
app = Flask(
    __name__,
    template_folder="../templates",
    static_folder="../static"
)

CORS(app)

UPLOAD_FOLDER = "uploads"

os.makedirs(
    UPLOAD_FOLDER,
    exist_ok=True
)

REQUIRED_COLUMNS = [
    "Country",
    "City",
    "Year",
    "AQI",
    "PM2.5",
    "PM10",
    "Deforestation_Rate_%",
    "Afforestation_Rate_%",
    "Vehicles_Increase_%",
    "Industries_Increase_%",
    "Env_Budget_Million_USD",
    "Population_Density_Per_SqKm",
    "CO2_Emissions_MT",
    "Green_Space_Ratio_%",
    "Avg_Life_Expectancy_Index"
]

def load_combined_dataset():

    base_df = pd.read_csv(
        "global_air_quality_deforestation_dataset.csv"
    )

    print("Base rows:", len(base_df))

    for filename in os.listdir(UPLOAD_FOLDER):

        if (
            filename.startswith("user_uploaded_")
            and filename.endswith(".csv")
        ):

            upload_path = os.path.join(
                UPLOAD_FOLDER,
                filename
            )

            uploaded_df = pd.read_csv(
                upload_path
            )

            base_df = pd.concat(
                [base_df, uploaded_df],
                ignore_index=True
            )

    base_df = base_df.drop_duplicates(
        subset=[
            "Country",
            "City",
            "Year"
        ]
    )

    return base_df

def rebuild_dataset():

    combined_df = load_combined_dataset()

    combined_df.to_csv(
        "combined_dataset.csv",
        index=False
    )

    return combined_df

@app.route(
    "/upload-dataset",
    methods=["POST"]
)
def upload_dataset():

    global df

    if "file" not in request.files:
        return jsonify({
            "error": "No file uploaded."
        }), 400

    file = request.files["file"]

    if file.filename == "":
        return jsonify({
            "error": "No file selected."
        }), 400

    file_bytes = file.read()
    new_hash = compute_file_hash(file_bytes)

    # ── Duplicate content check ────────────────────────────────────────────
    for filename in os.listdir(UPLOAD_FOLDER):
        if filename.startswith("user_uploaded_") and filename.endswith(".csv"):
            existing_path = os.path.join(UPLOAD_FOLDER, filename)
            with open(existing_path, "rb") as f:
                existing_bytes = f.read()
            if compute_file_hash(existing_bytes) == new_hash:
                return jsonify({
                    "error": "duplicate",
                    "message": "This dataset has already been uploaded. Please upload a different file."
                }), 409

    try:

        uploaded_df = pd.read_csv(io.BytesIO(file_bytes))

    except Exception:
        return jsonify({
            "error": "Invalid CSV file."
        }), 400

    missing_cols = [
        col
        for col in REQUIRED_COLUMNS
        if col not in uploaded_df.columns
    ]

    if missing_cols:

        return jsonify({
            "error":
            f"Missing columns: {missing_cols}"
        }), 400

    existing_files = [
        f for f in os.listdir(UPLOAD_FOLDER)
        if (
            f.startswith("user_uploaded_")
            and f.endswith(".csv")
        )
    ]

    next_number = len(existing_files) + 1

    filename = f"user_uploaded_{next_number}.csv"

    upload_path = os.path.join(
        UPLOAD_FOLDER,
        filename
    )

    with open(upload_path, "wb") as f:
        f.write(file_bytes)

    # Rebuild global df with encoding after upload
    raw_df = rebuild_dataset()

    df = (
        raw_df.groupby(
            ["Country", "City", "Year"],
            as_index=False
        )
        .mean(numeric_only=True)
    )

    # Re-attach Country and City after groupby
    country_city = raw_df[["Country", "City", "Year"]].drop_duplicates()
    df = df.merge(country_city, on=["Country", "City", "Year"], how="left") \
           if "Country" not in df.columns else df

    df["Country_Encoded"] = country_encoder.transform(df["Country"])

    return jsonify({
        "message":
        "Dataset integrated successfully.",
        "total_records":
        len(uploaded_df)
    })

from flask import render_template

@app.route("/")
def home():
    return render_template("index.html")

# Load model
model = load_model("models/vergemap_lstm.keras")

# Load scalers
feature_scaler = joblib.load(
    "models/feature_scaler.pkl"
)

target_scaler = joblib.load(
    "models/target_scaler.pkl"
)

# Country encoder
country_encoder = joblib.load(
    "models/country_encoder.pkl"
)

# Load dataset — FIX: was "local_df = ..." but then referenced "df" before assignment
df = load_combined_dataset()

df = (
    df.groupby(
        ["Country", "City", "Year"],
        as_index=False
    )
    .mean(numeric_only=True)
)

# Encode country
df["Country_Encoded"] = (
    country_encoder.transform(
        df["Country"]
    )
)

# features
feature_cols = [
    "Country_Encoded",
    "Year",
    "PM2.5",
    "PM10",
    "Deforestation_Rate_%",
    "Afforestation_Rate_%",
    "Vehicles_Increase_%",
    "Industries_Increase_%",
    "Env_Budget_Million_USD",
    "Population_Density_Per_SqKm",
    "CO2_Emissions_MT",
    "Green_Space_Ratio_%",
    "Avg_Life_Expectancy_Index"
]

# AQI classification
def classify_aqi(aqi):
    if aqi < 50:
        return "Stable"
    elif aqi <= 150:
        return "Warning"
    else:
        return "Critical"

# FORECAST ENDPOINT

# list all countries and cities in the dataset
@app.route("/locations")
def locations():

    locations = {}

    for country in sorted(df["Country"].unique()):

        cities = sorted(
            df[
                df["Country"] == country
            ]["City"].unique()
        )

        locations[country] = cities

    return jsonify(locations)

# city details
@app.route("/forecast", methods=["POST"])
def forecast():

    data = request.json

    country = data["Country"]
    city = data["City"]

    # Check if country exists in trained encoder
    if country not in country_encoder.classes_:

        return jsonify({
            "error":
            "Forecast unavailable. Country not included in trained model."
        }), 400

    city_df = (
        df[
            (df["Country"] == country)
            &
            (df["City"] == city)
        ]
        .sort_values("Year")
        .reset_index(drop=True)
    )

    if len(city_df) < 5:
        return jsonify({
            "error": "Not enough historical data available."
        }), 400

    latest_data = city_df[
        feature_cols
    ].tail(5)

    current_sequence = (
        feature_scaler.transform(
            latest_data
        )
    )

    current_sequence = current_sequence.reshape(
        1,
        5,
        len(feature_cols)
    )

    year_idx = feature_cols.index(
        "Year"
    )

    future_predictions = []

    current_year = int(
        city_df["Year"].max()
    )

    for step in range(5):

        pred_scaled = model.predict(
            current_sequence,
            verbose=0
        )

        pred_aqi = (
            target_scaler.inverse_transform(
                pred_scaled
            )[0][0]
        )

        future_year = (
            current_year + step + 1
        )

        future_predictions.append({
            "year": future_year,
            "aqi": round(
                float(pred_aqi),
                2
            ),
            "risk": classify_aqi(
                pred_aqi
            )
        })

        next_row = (
            current_sequence[0, -1]
            .copy()
        )

        next_row[year_idx] += (
            1 /
            (
                df["Year"].max()
                -
                df["Year"].min()
            )
        )

        current_sequence = np.concatenate(
            [
                current_sequence[:, 1:, :],
                next_row.reshape(
                    1,
                    1,
                    -1
                )
            ],
            axis=1
        )

    return jsonify({
        "Country": country,
        "City": city,
        "Forecast": future_predictions
    })

# average aqi by region
@app.route("/region-aqi")
def region_aqi():

    local_df = load_combined_dataset()  # FIX: local variable, does not overwrite global df

    region_map = {
        # Asia
        "Bangladesh":"Asia","China":"Asia","India":"Asia","Indonesia":"Asia",
        "Iran":"Asia","Iraq":"Asia","Japan":"Asia","Mongolia":"Asia",
        "Myanmar":"Asia","Pakistan":"Asia","Philippines":"Asia",
        "Saudi Arabia":"Asia","Thailand":"Asia","Turkey":"Asia",
        "UAE":"Asia","Vietnam":"Asia",

        # Europe
        "France":"Europe","Germany":"Europe","Italy":"Europe",
        "Netherlands":"Europe","Norway":"Europe","Poland":"Europe",
        "Romania":"Europe","Russia":"Europe","Spain":"Europe",
        "Sweden":"Europe","UK":"Europe","Ukraine":"Europe",

        # North America
        "USA":"North America","Canada":"North America","Mexico":"North America",

        # South America
        "Argentina":"South America","Brazil":"South America",
        "Chile":"South America","Colombia":"South America","Peru":"South America",

        # Africa
        "Egypt":"Africa","Ethiopia":"Africa","Ghana":"Africa",
        "Kenya":"Africa","Morocco":"Africa","Nigeria":"Africa",
        "South Africa":"Africa","Tanzania":"Africa",

        # Oceania
        "Australia":"Oceania"
    }

    local_df["Region"] = local_df["Country"].map(region_map)
    local_df = local_df.dropna(subset=["Region"])

    region_data = (
        local_df.groupby("Region")["AQI"]
        .mean()
        .round(1)
        .to_dict()
    )

    return jsonify(region_data)

# doughnut chart
@app.route("/chart-data")
def chart_data():

    local_df = load_combined_dataset()  # FIX: local variable, does not overwrite global df

    local_df = (
        local_df.groupby(
            ["Country", "City", "Year"],
            as_index=False
        )
        .mean(numeric_only=True)
    )

    stable = (local_df["AQI"] < 50).sum()
    warning = ((local_df["AQI"] >= 50) & (local_df["AQI"] <= 150)).sum()
    critical = (local_df["AQI"] > 150).sum()

    print("Grouped rows:", len(local_df))
    print("Stable:", stable)
    print("Warning:", warning)
    print("Critical:", critical)

    return jsonify({
        "stable": int(stable),
        "warning": int(warning),
        "critical": int(critical)
    })

# historical trend
@app.route("/historical", methods=["POST"])
def historical():

    data = request.json

    country = data["Country"]
    city = data["City"]

    city_df = (
        df[
            (df["Country"] == country)
            &
            (df["City"] == city)
        ]
        .sort_values("Year")
    )

    return jsonify({
        "years": city_df["Year"].tolist(),
        "aqi": city_df["AQI"].tolist()
    })

@app.route("/continent-aqi")
def continent_aqi():

    continent_map = {
        "United States": "North America",
        "Canada": "North America",
        "Mexico": "North America",

        "Brazil": "South America",
        "Argentina": "South America",

        "United Kingdom": "Europe",
        "Germany": "Europe",
        "France": "Europe",
        "Norway": "Europe",
        "Sweden": "Europe",
        "Poland": "Europe",

        "Japan": "Asia",
        "China": "Asia",
        "India": "Asia",
        "Philippines": "Asia",
        "Indonesia": "Asia",

        "Nigeria": "Africa",
        "Kenya": "Africa",
        "Tanzania": "Africa",
        "Ethiopia": "Africa",

        "Australia": "Oceania",
        "New Zealand": "Oceania"
    }

    local_df = df.copy()  # FIX: use a copy so we don't mutate the global df
    local_df["Continent"] = local_df["Country"].map(continent_map)

    continent_avg = (
        local_df.groupby("Continent")["AQI"]
        .mean()
        .round(2)
        .reset_index()
    )

    return jsonify(
        continent_avg.to_dict(orient="records")
    )

# high risk areas
@app.route("/high-risk-areas")
def high_risk_areas():

    local_df = load_combined_dataset()  # FIX: local variable, does not overwrite global df

    result = (
        local_df.groupby(["Country", "City"])["AQI"]
        .mean()
        .reset_index()
        .sort_values("AQI", ascending=False)
        .head(5)
    )

    return jsonify(result.to_dict(orient="records"))

# map
@app.route("/country-aqi")
def country_aqi():

    local_df = load_combined_dataset()  # FIX: local variable, does not overwrite global df

    country_data = (
        local_df.groupby("Country")["AQI"]
        .mean()
        .round(1)
        .to_dict()
    )

    return jsonify(country_data)

# reference dataset
from flask import send_file

@app.route("/download-dataset")
def download_dataset():

    return send_file(
        "global_air_quality_deforestation_dataset.csv",
        as_attachment=True,
        download_name="VergeMap_Dataset.csv"
    )

@app.route("/dashboard-stats")
def dashboard_stats():

    local_df = load_combined_dataset()  # FIX: local variable, does not overwrite global df

    avg_aqi = round(local_df["AQI"].mean(), 1)

    total_cities = (
        local_df[["Country", "City"]]
        .drop_duplicates()
        .shape[0]
    )

    return jsonify({
        "totalCities": int(total_cities),
        "avgAqi": float(avg_aqi)
    })

@app.route("/uploaded-dataset-count")
def uploaded_dataset_count():

    count = sum(
        1 for f in os.listdir(UPLOAD_FOLDER)
        if f.startswith("user_uploaded_") and f.endswith(".csv")
    )

    return jsonify({"count": count})


@app.route("/revert-dataset", methods=["POST"])
def revert_dataset():

    global df

    # Remove all user-uploaded CSV files
    removed_count = 0

    for filename in os.listdir(UPLOAD_FOLDER):
        if (
            filename.startswith("user_uploaded_")
            and filename.endswith(".csv")
        ):
            os.remove(
                os.path.join(UPLOAD_FOLDER, filename)
            )
            removed_count += 1

    if removed_count == 0:
        return jsonify({
            "message": "No uploaded datasets found. Already using the original dataset."
        })

    # Also remove combined_dataset.csv if it exists
    combined_path = "combined_dataset.csv"
    if os.path.exists(combined_path):
        os.remove(combined_path)

    # Reload global df from the original base dataset only
    base_df = pd.read_csv(
        "global_air_quality_deforestation_dataset.csv"
    )

    df = (
        base_df.groupby(
            ["Country", "City", "Year"],
            as_index=False
        )
        .mean(numeric_only=True)
    )

    df["Country_Encoded"] = (
        country_encoder.transform(
            df["Country"]
        )
    )

    return jsonify({
        "message": f"Reverted successfully. {removed_count} uploaded dataset(s) removed."
    })


# RUN APP

if __name__ == "__main__":
    app.run(debug=True)